#!/bin/bash
# Start GUI GGUF Trainer Server
cd /home/final-flash1/Desktop/visual-ai-architect
export LD_LIBRARY_PATH=/home/final-flash1/.local/lib:$LD_LIBRARY_PATH
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
nohup python3 -m training.gui_trainer.server --port 8765 --host 0.0.0.0 > /tmp/gui-server.log 2>&1 &
echo $!
