FROM python:3.12-slim
# kaggle CLI starts the GPU notebook on demand (see router.py); everything else is stdlib.
RUN pip install --no-cache-dir kaggle==1.7.4.5
COPY router.py /app/router.py
CMD ["python", "-u", "/app/router.py"]
