# Persian Book Cover OCR — Fine-Tuning Qwen2-VL-7B with LoRA

Fine-tuning the **Qwen2‑VL‑7B** vision-language model to read Persian book titles directly from book cover images, using **LoRA (Low-Rank Adaptation)** and the **Unsloth** framework for efficient, memory-friendly training.

This project evaluates how well a general-purpose vision-language model can learn to recognize Persian text from book cover images through parameter-efficient fine-tuning, using the `shenasa/bookroom-persian-book-covers-and-titles` dataset and comparing baseline vs. fine-tuned performance across multiple OCR metrics.

---

## Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Dataset](#-dataset)
- [Model & Method](#-model--method)
- [Evaluation Metrics](#-evaluation-metrics)
- [Results](#-results)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Notes & Limitations](#-notes--limitations)
- [Author](#-author)

---

## Project Overview

This project investigates whether a general-purpose vision-language model can be taught, through **parameter-efficient fine-tuning**, to accurately read and transcribe Persian text embedded in real-world images — specifically, book cover titles.

The pipeline covers the full experimental cycle:

1. Load the pretrained **Qwen2‑VL‑7B** model in 4-bit precision.
2. Attach **LoRA adapters** to the vision and language layers.
3. Prepare and format a Persian book-cover dataset as vision-language conversations.
4. Establish a **baseline** by evaluating the pretrained (non-fine-tuned) model.
5. **Fine-tune** the model with `SFTTrainer` (TRL) and Unsloth's vision data collator.
6. Re-evaluate the fine-tuned model and **quantitatively compare** it against the baseline.
7. Analyze error types, transition patterns, and statistical confidence of the improvements.
8. Save the resulting LoRA adapter weights.

## Key Features

-  **Efficient fine-tuning** with LoRA + Unsloth (4-bit quantization, gradient checkpointing).
-  **Persian (RTL) text rendering** in Matplotlib charts via `arabic_reshaper` and `python-bidi`.
-  **Before/after comparison** across five complementary OCR metrics.
-  **Statistical validation** using bootstrap confidence intervals on Exact Match accuracy.
-  **Qualitative & error-type analysis**, including a transition breakdown (wrong→correct, correct→wrong, etc.).
-  Auto-generated visualizations: training loss curve, metric comparison bars, similarity-score histograms, and error-category breakdowns.

## Dataset

| | |
|---|---|
| **Source** | [`shenasa/bookroom-persian-book-covers-and-titles`](https://huggingface.co/datasets/shenasa/bookroom-persian-book-covers-and-titles) (Hugging Face Hub) |
| **Content** | Persian book cover images paired with their ground-truth titles |
| **Training samples** | 1,000 (configurable via `TRAIN_SAMPLES`) |
| **Test samples** | 200 (configurable via `TEST_SAMPLES`) |

Each sample is converted into a chat-style conversation, where the user turn contains an instruction plus the cover image, and the assistant turn contains the target title:

```python
INSTRUCTION = (
    "You are an expert OCR assistant. "
    "Extract the exact Persian book title from the provided book cover image."
)
```

## Model & Method

| Component | Value |
|---|---|
| Base model | `unsloth/Qwen2-VL-7B-Instruct-bnb-4bit` |
| Fine-tuning method | LoRA (vision + language layers, attention + MLP modules) |
| LoRA rank (`r`) | 16 |
| LoRA alpha | 32 |
| LoRA dropout | 0 |
| Precision | 4-bit quantized |
| Framework | Unsloth (`FastVisionModel`) + TRL (`SFTTrainer`) |

### Training configuration

| Hyperparameter | Value |
|---|---|
| Batch size (per device) | 2 |
| Gradient accumulation steps | 4 |
| Epochs | 3 |
| Learning rate | 2e-4 |
| Warmup ratio | 0.05 |
| Weight decay | 0.001 |
| Max sequence length | 2048 |
| Random seed | 3407 |

## Evaluation Metrics

The model is evaluated before and after fine-tuning using:

- **Exact Match (EM)** — percentage of predictions identical to the ground truth.
- **Levenshtein Accuracy** — normalized similarity based on edit distance.
- **Word-level F1 Score** — token-overlap F1 between prediction and reference.
- **Character Error Rate (CER)** — lower is better.
- **Word Error Rate (WER)** — lower is better.

Additional analyses included in the notebook:
- Error-type categorization (Exact Match, Missing/Extra Word, Minor/Moderate Recognition Error, Completely Incorrect).
- Prediction transition analysis (how many samples flipped from wrong→correct, correct→wrong, etc.).
- 95% bootstrap confidence interval on Exact Match accuracy.
- Qualitative side-by-side comparison of predictions vs. ground truth for representative samples.

## Results

Running the notebook produces a full before/after comparison table and charts, for example:

```
Performance Comparison
==========================================================================================
Metric                               Baseline     Fine-Tuned       Improvement
------------------------------------------------------------------------------------------
Exact Match                             0.00%          14.00%            14.00%
Levenshtein Accuracy                   16.93%          61.26%            44.32%
Word-level F1                           8.95%          44.22%            35.27%
Character Error Rate (CER)            331.28%          60.60%           270.68%
Word Error Rate (WER)                 313.97%          86.54%           227.43%
------------------------------------------------------------------------------------------
```

> Exact numeric results depend on the training run (seed, sample size, hardware) and are printed/plotted at the end of the notebook, together with the training loss curve and error-distribution charts.

## 🛠 Requirements

- Python 3.10+
- CUDA-capable GPU (tested on an NVIDIA L4, 24 GB VRAM; a GPU with ≥16 GB VRAM is recommended for 4-bit training)
- Key libraries:
  - `unsloth`, `unsloth_zoo`
  - `torch`, `transformers==4.56.2`, `trl==0.22.2`, `peft`, `bitsandbytes`, `accelerate`, `triton`, `xformers`
  - `datasets`, `huggingface_hub`, `sentencepiece`, `protobuf`
  - `Levenshtein`, `matplotlib`, `numpy`, `pandas`
  - `arabic_reshaper`, `python-bidi` (for correct RTL Persian rendering in plots)

## ⚙️ Installation

The notebook installs all dependencies automatically in its first cells, with environment-aware handling for Google Colab vs. local/cloud setups. To reproduce this manually:

```bash
pip install unsloth
pip install sentencepiece protobuf "datasets==4.3.0" "huggingface_hub>=0.34.0" hf_transfer
pip install --no-deps unsloth_zoo bitsandbytes accelerate xformers peft trl triton
pip install transformers==4.56.2
pip install --no-deps trl==0.22.2
pip install Levenshtein matplotlib
pip install arabic_reshaper python-bidi
```

> The exact `xformers` version is auto-selected based on the installed `torch` version — see the first notebook cell for the mapping table.

## Usage

1. Open `OCR_project_Qwen2_7B.ipynb` in Jupyter, Google Colab, or Kaggle (a GPU runtime is required).
2. Run the setup cells to install dependencies and load the base model.
3. Adjust configuration constants as needed:
   - `TRAIN_SAMPLES`, `TEST_SAMPLES` — dataset size
   - `LORA_R`, `LORA_ALPHA`, `LORA_DROPOUT` — LoRA hyperparameters
   - `BATCH_SIZE`, `NUM_EPOCHS`, `LEARNING_RATE` — training hyperparameters
4. Run all cells sequentially to:
   - Evaluate the baseline (pretrained) model
   - Fine-tune the model with LoRA
   - Evaluate the fine-tuned model and compare results
5. The fine-tuned LoRA adapters are saved locally to the `qwen2vl_persian_ocr_lora/` directory:

```python
SAVE_PATH = "qwen2vl_persian_ocr_lora"
model.save_pretrained(SAVE_PATH)
tokenizer.save_pretrained(SAVE_PATH)
```

To reload the fine-tuned adapters later for inference:

```python
from unsloth import FastVisionModel

model, tokenizer = FastVisionModel.from_pretrained(
    model_name="qwen2vl_persian_ocr_lora",
    load_in_4bit=True,
)
FastVisionModel.for_inference(model)
```

## Project Structure

```
.
├── OCR_project_Qwen2_7B.ipynb   # Main notebook (training + evaluation pipeline)
└── README.md
```

## Notes & Limitations

- Only the **LoRA adapter weights** are saved after training — the base Qwen2‑VL‑7B model is **not** bundled and must be downloaded separately from the Hub.
- To deploy the model as a single merged checkpoint (16-bit) or as a GGUF file, additional export steps beyond this notebook are required.
- Results are sensitive to the number of training/test samples, the random seed, and the number of epochs — adjust the configuration cells to reproduce or extend the experiments.
- The notebook was developed and tested on an NVIDIA L4 GPU (24 GB VRAM) in a Google Colab environment.

## 👩‍💻 About the Author

<b>Sarah M Afshar</b>  
<i>Python Developer | Generative AI Specialist</i>

I am a passionate developer focused on the intersection of <b>Large Language Models (LLMs)</b>, neural network architectures, and the evolution of intelligent systems.  
This project is part of my journey in exploring the mathematical foundations of AI.

🔗 GitHub: https://github.com/afshars  

🔗 LinkedIn: https://www.linkedin.com/in/sara-m-afshar/
