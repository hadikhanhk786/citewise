import os
import asyncio
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI

load_dotenv()

async def test_gemini():
    print("Testing Gemini...")
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        embed_model = os.getenv("GEMINI_EMBED_MODEL")
            
        embeddings = GoogleGenerativeAIEmbeddings(
            model=embed_model,
            google_api_key=api_key
        )
        res = await embeddings.aembed_query("Hello world")
        print(f"✅ Gemini Embeddings works (vector length: {len(res)})")
        
        chat = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_CHAT_MODEL"),
            google_api_key=api_key
        )
        msg = await chat.ainvoke("Say hi")
        print(f"✅ Gemini Chat works: {msg.content}")
    except Exception as e:
        print(f"❌ Gemini Error: {type(e).__name__} - {e}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
