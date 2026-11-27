"""Writes citewise-sft-train.ipynb: QLoRA fine-tune of Qwen2.5-Coder-7B on the sft-data output.

Run `python build_notebook.py`; push with `kaggle kernels push -p kaggle/sft-train`
after citewise-sft-data has finished (its output is mounted via kernel_sources).
"""
import json
import pathlib

CELLS = [
("markdown", """# Citewise SFT training: Qwen2.5-Coder-7B + QLoRA (Unsloth)

GPU 0 trains; GPU 1 runs the teacher (`qwen2.5-coder:14b`) as a judge. Output in `/kaggle/working`:
`gguf/` (model for Ollama), `Modelfile`, `eval_report.json`. Private, non-commercial use."""),

("code", """BASE = "unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit"
JUDGE = "qwen2.5-coder:14b"
MAX_SEQ = 2048
EPOCHS = 1          # v1 used 2 epochs at 2e-4 and lost to the base model
LR = 1e-4
EVAL_QUESTIONS = 60
import os, glob
# Kaggle mounts the citewise-sft-data output under /kaggle/input; the exact sub-path varies.
found = glob.glob("/kaggle/input/**/train.jsonl", recursive=True)
if not found:
    for root, dirs, files in os.walk("/kaggle/input"):
        print(root, files[:5])
    raise SystemExit("train.jsonl not found under /kaggle/input (is citewise-sft-data attached as input?)")
DATA = os.path.dirname(found[0])
print("data:", DATA, os.listdir(DATA))"""),

("code", """# Judge on GPU 1 (pulls while GPU 0 trains).
import subprocess, time, urllib.request
subprocess.run("apt-get -qq install -y zstd > /dev/null && curl -fsSL https://ollama.com/install.sh | sh > /dev/null", shell=True, check=True)
jenv = {**os.environ, "CUDA_VISIBLE_DEVICES": "1", "OLLAMA_HOST": "127.0.0.1:11434", "OLLAMA_KEEP_ALIVE": "-1"}
subprocess.Popen(["ollama", "serve"], env=jenv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(5)
judge_pull = subprocess.Popen(["ollama", "pull", JUDGE], env=jenv, stdout=subprocess.DEVNULL)"""),

("code", """%%capture
!pip install -q unsloth"""),

("code", """os.environ["CUDA_VISIBLE_DEVICES"] = "0"
from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template, train_on_responses_only
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=MAX_SEQ, load_in_4bit=True)
tok = get_chat_template(tok, chat_template="qwen-2.5")
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16, lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth", random_state=7)

ds = load_dataset("json", data_files={"train": f"{DATA}/train.jsonl", "eval": f"{DATA}/eval.jsonl"})
fmt = lambda b: {"text": [tok.apply_chat_template(m, tokenize=False) for m in b["messages"]]}
ds = ds.map(fmt, batched=True)
print(ds)"""),

("code", """trainer = SFTTrainer(
    model=model, tokenizer=tok, train_dataset=ds["train"], eval_dataset=ds["eval"],
    args=SFTConfig(dataset_text_field="text", max_seq_length=MAX_SEQ, per_device_train_batch_size=2,
                   gradient_accumulation_steps=8, num_train_epochs=EPOCHS, learning_rate=LR,
                   warmup_ratio=0.03, lr_scheduler_type="cosine", logging_steps=10, eval_strategy="epoch",
                   fp16=True, optim="adamw_8bit", output_dir="/tmp/out", report_to="none", seed=7))
trainer = train_on_responses_only(trainer, instruction_part="<|im_start|>user\\n",
                                  response_part="<|im_start|>assistant\\n")
stats = trainer.train()
print(stats)
print(trainer.evaluate())"""),

("code", """# Answer held-out questions with the fine-tuned model and with the base model (adapter disabled).
import json, random
random.seed(7)
# Balanced across sources (v1's sample was mostly system-design questions).
from collections import defaultdict
by_src = defaultdict(list)
for l in open(f"{DATA}/eval.jsonl"):
    e = json.loads(l); by_src[e["source"]].append(e)
for v in by_src.values():
    random.shuffle(v)
evals = []
while len(evals) < EVAL_QUESTIONS and any(by_src.values()):
    for v in by_src.values():
        if v and len(evals) < EVAL_QUESTIONS:
            evals.append(v.pop())
FastLanguageModel.for_inference(model)

def answer(messages):
    ids = tok.apply_chat_template(messages[:2], add_generation_prompt=True, return_tensors="pt").to("cuda")
    out = model.generate(input_ids=ids, max_new_tokens=600, temperature=0.2, do_sample=True)
    return tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()

rows = []
for e in evals:
    tuned = answer(e["messages"])
    with model.disable_adapter():
        base = answer(e["messages"])
    rows.append({"question": e["messages"][1]["content"], "reference": e["messages"][2]["content"],
                 "base": base, "tuned": tuned, "source": e["source"]})
print(len(rows), "answered")"""),

("code", """# Judge: teacher scores each answer 1-10 against the reference (order shuffled to avoid bias).
judge_pull.wait()
JUDGE_PROMPT = '''Score two answers to a software-engineering question for correctness, completeness and
usefulness, using the reference answer as ground truth. Return JSON {{"A": <1-10>, "B": <1-10>}}.

QUESTION: {q}

REFERENCE: {ref}

ANSWER A: {a}

ANSWER B: {b}'''

def judge(r):
    flip = random.random() < 0.5
    a, b = (r["tuned"], r["base"]) if flip else (r["base"], r["tuned"])
    body = {"model": JUDGE, "stream": False, "format": "json", "options": {"temperature": 0},
            "messages": [{"role": "user", "content": JUDGE_PROMPT.format(q=r["question"], ref=r["reference"], a=a, b=b)}]}
    req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    s = json.loads(json.load(urllib.request.urlopen(req, timeout=600))["message"]["content"])
    return (s["A"], s["B"]) if flip else (s["B"], s["A"])   # (tuned, base)

scores = []
for r in rows:
    try:
        r["tuned_score"], r["base_score"] = judge(r); scores.append(r)
    except Exception as e:
        print("judge skip:", str(e)[:100])
avg = lambda k: round(sum(r[k] for r in scores) / max(1, len(scores)), 2)
report = {"judged": len(scores), "base_avg": avg("base_score"), "tuned_avg": avg("tuned_score"),
          "tuned_wins": sum(r["tuned_score"] > r["base_score"] for r in scores),
          "base_wins": sum(r["base_score"] > r["tuned_score"] for r in scores),
          "train_stats": str(stats)}
json.dump({"summary": report, "rows": scores}, open("/kaggle/working/eval_report.json", "w"), indent=1)
print(json.dumps(report, indent=1))"""),

("code", """# Export to GGUF (q4_k_m) for Ollama, only if the fine-tune beat the base model. The merge and f16
# intermediate need ~30 GB, more than /kaggle/working has, so build in /tmp and copy the final file.
import shutil
if report["tuned_avg"] <= report["base_avg"]:
    raise SystemExit(f"Fine-tune did not beat the base model ({report['tuned_avg']} vs {report['base_avg']}); not exporting.")
print(shutil.disk_usage("/tmp"))
model.save_pretrained_gguf("/tmp/gguf", tok, quantization_method="q4_k_m")
os.makedirs("/kaggle/working/gguf", exist_ok=True)
for f in glob.glob("/tmp/gguf/*q4_k_m*.gguf") or glob.glob("/tmp/gguf/*.gguf"):
    shutil.copy(f, "/kaggle/working/gguf/")
gguf = sorted(glob.glob("/kaggle/working/gguf/*.gguf"))
print(gguf)
open("/kaggle/working/Modelfile", "w").write(
    f"FROM ./gguf/{os.path.basename(gguf[-1])}\\n"
    'TEMPLATE \\"\\"\\"{{- if .System }}<|im_start|>system\\n{{ .System }}<|im_end|>\\n{{ end }}'
    '{{- range .Messages }}<|im_start|>{{ .Role }}\\n{{ .Content }}<|im_end|>\\n{{ end }}<|im_start|>assistant\\n\\"\\"\\"\\n'
    'PARAMETER stop "<|im_end|>"\\nPARAMETER temperature 0.2\\n')
print(open("/kaggle/working/Modelfile").read())"""),
]

nb = {"cells": [{"cell_type": t, "metadata": {}, "source": s.splitlines(True),
                 **({"outputs": [], "execution_count": None} if t == "code" else {})} for t, s in CELLS],
      "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
here = pathlib.Path(__file__).parent
(here / "citewise-sft-train.ipynb").write_text(json.dumps(nb, indent=1))
(here / "kernel-metadata.json").write_text(json.dumps({
    "id": "hadikhanhk/citewise-sft-train", "title": "citewise-sft-train", "code_file": "citewise-sft-train.ipynb",
    "language": "python", "kernel_type": "notebook", "is_private": True, "enable_gpu": True,
    "enable_internet": True, "dataset_sources": [], "competition_sources": [],
    "kernel_sources": ["hadikhanhk/citewise-sft-data"]}, indent=2))
for c in nb["cells"]:
    if c["cell_type"] == "code":
        src = "".join(c["source"])
        if not src.startswith("%%"):
            compile(src, "cell", "exec")
print("wrote", here / "citewise-sft-train.ipynb")
