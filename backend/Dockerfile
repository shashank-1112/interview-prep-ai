# Backend container for InterviewPrep AI.
#
# Pinned to python:3.11-slim specifically, not a newer/"latest" tag -
# pydantic-core (a compiled dependency) has no prebuilt wheel for Python
# 3.14 yet, which caused a real build failure during local development
# (see the backend README/Stage 2 notes: the local venv had to be built
# with python3.11 for the same reason). 3.11 is a stable, well-supported
# target for this dependency set.
FROM python:3.11-slim

WORKDIR /app

# Copy just requirements first so Docker can cache this layer - `pip
# install` (slow) only re-runs when requirements.txt itself changes, not
# on every source code edit.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the actual application code.
COPY app ./app

EXPOSE 8000

# --host 0.0.0.0 is required inside a container: uvicorn's default
# (127.0.0.1) would only accept connections from inside the container
# itself, making the server unreachable from the host machine or from
# another container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
