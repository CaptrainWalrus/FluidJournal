#!/usr/bin/env python3
"""
Quick setup and run script for ProjectX domain crawler
"""

import subprocess
import sys
import os

def install_requirements():
    """Install required packages"""
    print("📦 Installing required packages...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements_pdf.txt'])
        print("✅ Packages installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install packages: {e}")
        return False

def check_system_dependencies():
    """Check if system dependencies are available"""
    print("🔍 Checking system dependencies...")
    
    # Check if we can import weasyprint
    try:
        import weasyprint
        print("✅ WeasyPrint available")
        return True
    except ImportError as e:
        print(f"❌ WeasyPrint import failed: {e}")
        print("\n🛠️  System dependency installation needed:")
        print("Ubuntu/Debian: sudo apt-get install python3-cffi python3-brotli libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0")
        print("macOS: brew install pango")
        print("Windows: Should work with pip install weasyprint")
        return False

def run_crawler():
    """Run the main crawler"""
    print("🕷️  Starting crawler...")
    try:
        from domain_to_pdf import main
        main()
    except KeyboardInterrupt:
        print("\n⚠️  Crawler stopped by user")
    except Exception as e:
        print(f"❌ Crawler failed: {e}")

def main():
    """Main setup and run function"""
    print("🚀 ProjectX Domain to PDF Crawler")
    print("=" * 40)
    
    # Check if requirements file exists
    if not os.path.exists('requirements_pdf.txt'):
        print("❌ requirements_pdf.txt not found!")
        return
    
    # Install packages
    if not install_requirements():
        return
    
    # Check system dependencies
    if not check_system_dependencies():
        print("\n⚠️  Please install system dependencies and try again")
        return
    
    print("\n" + "=" * 40)
    print("🎯 Configuration:")
    print("• Target: https://www.projectx.com/")
    print("• Max pages: 50 (configurable)")
    print("• Max depth: 3 levels")
    print("• Delay: 1 second between requests")
    print("• Output: projectx_complete.pdf")
    print("=" * 40)
    
    # Confirm before starting
    confirm = input("\n▶️  Start crawling? (y/N): ").lower().strip()
    if confirm == 'y':
        run_crawler()
    else:
        print("👋 Crawler cancelled")

if __name__ == '__main__':
    main()