#!/usr/bin/env python3
"""
Windows setup script for ProjectX domain crawler
Downloads and installs wkhtmltopdf automatically
"""

import subprocess
import sys
import os
import requests
import zipfile
from pathlib import Path
import tempfile

def install_python_packages():
    """Install required Python packages"""
    print("📦 Installing Python packages...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements_windows.txt'])
        print("✅ Python packages installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install Python packages: {e}")
        return False

def check_wkhtmltopdf():
    """Check if wkhtmltopdf is available"""
    try:
        result = subprocess.run(['wkhtmltopdf', '--version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print("✅ wkhtmltopdf is already installed")
            return True
    except:
        pass
    
    print("❌ wkhtmltopdf not found")
    return False

def download_wkhtmltopdf():
    """Download and setup wkhtmltopdf for Windows"""
    print("📥 Downloading wkhtmltopdf...")
    
    # Download URL for Windows 64-bit
    url = "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe"
    
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            installer_path = Path(temp_dir) / "wkhtmltopdf_installer.exe"
            
            # Download installer
            response = requests.get(url, stream=True)
            response.raise_for_status()
            
            with open(installer_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            print("✅ Downloaded wkhtmltopdf installer")
            print(f"📍 Installer location: {installer_path}")
            print("\n🚀 Please run the installer manually:")
            print(f"   {installer_path}")
            print("\n⚠️  After installation, add to PATH:")
            print("   C:\\Program Files\\wkhtmltopdf\\bin")
            
            # Open installer location
            os.startfile(temp_dir)
            
            return True
            
    except Exception as e:
        print(f"❌ Failed to download wkhtmltopdf: {e}")
        return False

def provide_manual_instructions():
    """Provide manual installation instructions"""
    print("\n🛠️  Manual Installation Instructions:")
    print("=" * 50)
    print("1. Download wkhtmltopdf from:")
    print("   https://wkhtmltopdf.org/downloads.html")
    print("2. Install the Windows version")
    print("3. Add to PATH: C:\\Program Files\\wkhtmltopdf\\bin")
    print("4. Restart command prompt")
    print("5. Test with: wkhtmltopdf --version")
    print("=" * 50)

def test_setup():
    """Test if everything is working"""
    print("\n🧪 Testing setup...")
    
    try:
        import pdfkit
        print("✅ pdfkit imported successfully")
    except ImportError as e:
        print(f"❌ pdfkit import failed: {e}")
        return False
    
    try:
        # Test wkhtmltopdf
        test_html = "<html><body><h1>Test</h1></body></html>"
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            pdfkit.from_string(test_html, tmp.name)
            os.unlink(tmp.name)
        print("✅ PDF generation test successful")
        return True
    except Exception as e:
        print(f"❌ PDF generation test failed: {e}")
        print("   Make sure wkhtmltopdf is installed and in PATH")
        return False

def main():
    """Main setup function"""
    print("🚀 ProjectX Windows Setup")
    print("=" * 40)
    
    # Install Python packages
    if not install_python_packages():
        return
    
    # Check wkhtmltopdf
    if not check_wkhtmltopdf():
        print("\n🔧 wkhtmltopdf setup required...")
        
        choice = input("Auto-download installer? (y/N): ").lower().strip()
        if choice == 'y':
            if download_wkhtmltopdf():
                print("\n⏳ Please install wkhtmltopdf and restart this script")
                return
        else:
            provide_manual_instructions()
            return
    
    # Test setup
    if test_setup():
        print("\n🎉 Setup complete! Ready to crawl ProjectX.com")
        print("\nRun with: python domain_to_pdf_windows.py")
    else:
        print("\n⚠️  Setup incomplete. Please check wkhtmltopdf installation.")

if __name__ == '__main__':
    main()