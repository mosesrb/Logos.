import sys
import os
import torch
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import warnings

# Hide warnings for cleaner output
warnings.filterwarnings("ignore")

def main():
    try:
        # Load model and processor ONCE at startup
        # Phase 14: local_files_only=True ensures 100% offline privacy after first download
        model_name = "Salesforce/blip-image-captioning-base"
        
        # Load initially without local_files_only so it can download if missing
        # But for persistent worker, we'll try to be robust
        try:
            processor = BlipProcessor.from_pretrained(model_name, local_files_only=True)
            model = BlipForConditionalGeneration.from_pretrained(model_name, local_files_only=True)
        except Exception:
            # Fallback for first run
            processor = BlipProcessor.from_pretrained(model_name)
            model = BlipForConditionalGeneration.from_pretrained(model_name)

        print("READY", flush=True)

        # Loop forever, reading image paths from stdin
        for line in sys.stdin:
            image_path = line.strip()
            if not image_path:
                continue
            
            if image_path.lower() == "exit":
                break

            try:
                if not os.path.exists(image_path):
                    print(f"Error: File not found: {image_path}", flush=True)
                    continue

                raw_image = Image.open(image_path).convert('RGB')
                inputs = processor(raw_image, return_tensors="pt")
                out = model.generate(**inputs)
                caption = processor.decode(out[0], skip_special_tokens=True)
                print(caption, flush=True)

            except Exception as e:
                print(f"Error: {str(e)}", flush=True)

    except Exception as e:
        print(f"FATAL: {str(e)}", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

