#!/usr/bin/env python3

"""
Prepare and Execute GPU Training Pipeline
1. Run data health check with DuckDB
2. If data is ready, proceed to GPU training
"""

import sys
import os
import subprocess
from pathlib import Path

def run_health_check():
    """Run the data health check"""
    print("🏥 Running Data Health Check...")
    print("=" * 50)
    
    try:
        # Run the health check script
        result = subprocess.run([
            sys.executable, 'data_health_check.py'
        ], capture_output=True, text=True, cwd=Path(__file__).parent)
        
        print(result.stdout)
        if result.stderr:
            print("Warnings/Errors:")
            print(result.stderr)
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def run_gpu_training():
    """Run GPU training with progress bars"""
    print("\n🚀 Starting GPU Training...")
    print("=" * 50)
    
    try:
        # Activate venv and run enhanced GP trainer
        venv_python = Path(__file__).parent / "venv" / "bin" / "python"
        if not venv_python.exists():
            venv_python = sys.executable  # Fallback to system python
        
        # Change to GP service directory
        gp_service_dir = Path(__file__).parent / "gp-service"
        
        # Run the enhanced trainer
        result = subprocess.run([
            str(venv_python), 'gp_trainer_enhanced.py'
        ], cwd=gp_service_dir, text=True)
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"❌ GPU training failed: {e}")
        return False

def main():
    """Main execution pipeline"""
    print("🧠 GPU Training Preparation Pipeline")
    print("=" * 60)
    
    # Step 1: Health check
    health_ok = run_health_check()
    
    if not health_ok:
        print("\n❌ Data health check failed!")
        print("Please address data issues before proceeding to training.")
        return 1
    
    print("\n✅ Data health check passed!")
    
    # Step 2: Ask user confirmation
    print("\nProceed with GPU training? (y/n): ", end="")
    response = input().strip().lower()
    
    if response != 'y':
        print("Training cancelled by user.")
        return 0
    
    # Step 3: GPU training
    training_ok = run_gpu_training()
    
    if training_ok:
        print("\n🎉 GPU training completed successfully!")
        return 0
    else:
        print("\n❌ GPU training failed!")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)