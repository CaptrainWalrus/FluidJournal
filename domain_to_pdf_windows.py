#!/usr/bin/env python3
"""
Windows-compatible Domain to PDF Crawler
Uses pdfkit (wkhtmltopdf) instead of WeasyPrint for Windows compatibility
"""

import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
import pdfkit
from PyPDF2 import PdfMerger
import requests
from urllib.parse import urljoin, urlparse
import os
import time
import logging
from pathlib import Path
import tempfile

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProjectXSpider(scrapy.Spider):
    name = 'projectx_spider'
    allowed_domains = ['projectx.com']
    start_urls = ['https://www.projectx.com/']
    
    def __init__(self):
        self.visited_urls = set()
        self.pdf_files = []
        self.output_dir = Path('projectx_pdfs')
        self.output_dir.mkdir(exist_ok=True)
        
        # Configure wkhtmltopdf options
        self.pdf_options = {
            'page-size': 'A4',
            'margin-top': '0.75in',
            'margin-right': '0.75in',
            'margin-bottom': '0.75in',
            'margin-left': '0.75in',
            'encoding': "UTF-8",
            'no-outline': None,
            'enable-local-file-access': None
        }
        
    def parse(self, response):
        """Parse each page and extract links"""
        current_url = response.url
        
        # Skip if already processed
        if current_url in self.visited_urls:
            return
            
        self.visited_urls.add(current_url)
        logger.info(f"Processing: {current_url}")
        
        # Generate PDF for this page
        self.generate_page_pdf(response)
        
        # Extract all internal links
        links = response.css('a::attr(href)').getall()
        
        for link in links:
            # Convert relative URLs to absolute
            absolute_url = urljoin(current_url, link)
            parsed_url = urlparse(absolute_url)
            
            # Only follow links within the same domain
            if (parsed_url.netloc in self.allowed_domains or 
                parsed_url.netloc == '' or 
                parsed_url.netloc.endswith('.projectx.com')):
                
                # Skip certain file types and fragments
                if not any(absolute_url.lower().endswith(ext) for ext in 
                          ['.pdf', '.jpg', '.png', '.gif', '.zip', '.doc', '.xls']):
                    if '#' not in absolute_url:  # Skip anchor links
                        yield scrapy.Request(
                            url=absolute_url,
                            callback=self.parse,
                            dont_filter=False,
                            meta={'depth': response.meta.get('depth', 0) + 1}
                        )
    
    def generate_page_pdf(self, response):
        """Generate PDF from page content using pdfkit"""
        try:
            # Clean URL for filename
            url_path = urlparse(response.url).path
            filename = url_path.replace('/', '_').replace('\\', '_')
            if not filename or filename == '_':
                filename = 'index'
            
            # Remove invalid characters
            filename = "".join(c for c in filename if c.isalnum() or c in ('-', '_', '.'))
            pdf_path = self.output_dir / f"{filename}_{len(self.pdf_files):03d}.pdf"
            
            # Create enhanced HTML with header and styling
            enhanced_html = self.create_enhanced_html(response.text, response.url)
            
            # Generate PDF using pdfkit
            try:
                pdfkit.from_string(enhanced_html, str(pdf_path), options=self.pdf_options)
                self.pdf_files.append(str(pdf_path))
                logger.info(f"Generated PDF: {pdf_path}")
            except OSError as e:
                if 'wkhtmltopdf' in str(e):
                    logger.error("wkhtmltopdf not found! Please install it first.")
                    logger.info("Download from: https://wkhtmltopdf.org/downloads.html")
                    return
                raise e
                
        except Exception as e:
            logger.error(f"Failed to generate PDF for {response.url}: {e}")
    
    def create_enhanced_html(self, html_content, url):
        """Create enhanced HTML with header and styling"""
        header = f"""
        <div style="border-bottom: 2px solid #ccc; margin-bottom: 20px; padding-bottom: 10px;">
            <h1 style="margin: 0; font-size: 18px; color: #333;">ProjectX.com</h1>
            <p style="margin: 5px 0; font-size: 12px; color: #666;">{url}</p>
            <p style="margin: 0; font-size: 10px; color: #999;">Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
        </div>
        """
        
        # CSS for better PDF output
        css = """
        <style>
            body { 
                font-family: Arial, sans-serif; 
                font-size: 12px; 
                line-height: 1.4; 
                margin: 0; 
                padding: 20px;
            }
            img { 
                max-width: 100%; 
                height: auto; 
            }
            .no-print, nav, footer, .sidebar, .advertisement { 
                display: none !important; 
            }
            h1, h2, h3 { 
                color: #333; 
                margin-top: 20px; 
            }
            a { 
                color: #0066cc; 
            }
            pre, code { 
                background: #f5f5f5; 
                padding: 5px; 
                border-radius: 3px; 
            }
        </style>
        """
        
        # Insert CSS and header
        if '<head>' in html_content:
            head_end = html_content.find('</head>')
            if head_end != -1:
                html_content = html_content[:head_end] + css + html_content[head_end:]
        
        if '<body' in html_content:
            body_start = html_content.find('>', html_content.find('<body'))
            if body_start != -1:
                html_content = (html_content[:body_start+1] + 
                              header + 
                              html_content[body_start+1:])
        
        return html_content
    
    def closed(self, reason):
        """Called when spider finishes - combine all PDFs"""
        logger.info(f"Spider finished. Combining {len(self.pdf_files)} PDFs...")
        
        if self.pdf_files:
            self.combine_pdfs()
        else:
            logger.warning("No PDFs generated!")
    
    def combine_pdfs(self):
        """Combine all generated PDFs into one file"""
        try:
            merger = PdfMerger()
            
            # Sort PDF files to maintain some order
            sorted_pdfs = sorted(self.pdf_files)
            
            for pdf_file in sorted_pdfs:
                if os.path.exists(pdf_file):
                    logger.info(f"Adding to combined PDF: {pdf_file}")
                    merger.append(pdf_file)
            
            # Output combined PDF
            output_path = 'projectx_complete.pdf'
            merger.write(output_path)
            merger.close()
            
            logger.info(f"✅ Combined PDF created: {output_path}")
            logger.info(f"📄 Total pages combined: {len(sorted_pdfs)}")
            
            # Optionally clean up individual PDFs
            cleanup = input("Delete individual PDF files? (y/N): ").lower().strip()
            if cleanup == 'y':
                for pdf_file in self.pdf_files:
                    try:
                        os.remove(pdf_file)
                    except:
                        pass
                logger.info("Individual PDF files cleaned up")
                
        except Exception as e:
            logger.error(f"Failed to combine PDFs: {e}")

def main():
    """Main function to run the crawler"""
    logger.info("🕷️  Starting ProjectX.com crawler (Windows version)...")
    
    # Configure Scrapy settings
    settings = get_project_settings()
    settings.setdict({
        'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'ROBOTSTXT_OBEY': True,  # Respect robots.txt
        'DOWNLOAD_DELAY': 1,     # Be polite - 1 second between requests
        'RANDOMIZE_DOWNLOAD_DELAY': True,
        'CONCURRENT_REQUESTS': 1,  # One request at a time
        'DEPTH_LIMIT': 3,        # Limit crawl depth
        'CLOSESPIDER_PAGECOUNT': 50,  # Limit total pages (adjust as needed)
        'LOG_LEVEL': 'INFO',
    })
    
    # Run the spider
    process = CrawlerProcess(settings)
    process.crawl(ProjectXSpider)
    process.start()

if __name__ == '__main__':
    main()