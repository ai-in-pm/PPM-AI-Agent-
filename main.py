#!/usr/bin/env python3
"""
IP2M METRR Copilot - Python GUI Launcher

This application provides a user-friendly graphical interface to launch and manage
the IP2M METRR Copilot system components including the API server, desktop application,
and document indexer.

Requirements:
- Python 3.8+
- Node.js 18+
- pnpm package manager
- Ollama (optional, for AI features)

Author: AI Assistant
Version: 0.1.0
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import subprocess
import threading
import os
import sys
import json
import time
import webbrowser
from pathlib import Path
from typing import Dict, Optional, List
import requests
import datetime

class IP2MControlPanel:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("IP2M METRR Copilot - Control Panel")
        self.root.geometry("900x700")
        self.root.resizable(True, True)
        
        # Process tracking
        self.processes: Dict[str, subprocess.Popen] = {}
        self.process_status: Dict[str, str] = {
            'api': 'stopped',
            'desktop': 'stopped',
            'indexer': 'stopped'
        }
        
        # Configuration
        self.project_root = Path(__file__).parent
        self.config = self.load_config()
        
        self.setup_ui()
        self.check_dependencies()
        self.start_status_monitor()
    
    def load_config(self) -> Dict:
        """Load configuration from .env.local or use defaults"""
        config = {
            'api_port': 4317,
            'api_host': 'localhost',
            'ollama_url': 'http://127.0.0.1:11434',
            'desktop_port': 3000,
            'corpus_path': './data/corpus',
            'db_path': './data/db'
        }
        
        env_file = self.project_root / '.env.local'
        if env_file.exists():
            try:
                with open(env_file, 'r') as f:
                    for line in f:
                        if '=' in line and not line.strip().startswith('#'):
                            key, value = line.strip().split('=', 1)
                            if key == 'API_PORT':
                                config['api_port'] = int(value)
                            elif key == 'API_HOST':
                                config['api_host'] = value
                            elif key == 'OLLAMA_URL':
                                config['ollama_url'] = value
                            elif key == 'CORPUS_PATH':
                                config['corpus_path'] = value
                            elif key == 'DB_PATH':
                                config['db_path'] = value
            except Exception as e:
                print(f"Warning: Could not load .env.local: {e}")
        
        return config
    
    def setup_ui(self):
        """Setup the user interface"""
        # Main notebook for tabs
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Control tab
        self.setup_control_tab()
        
        # Configuration tab
        self.setup_config_tab()
        
        # Logs tab
        self.setup_logs_tab()
        
        # Chat Interface tab
        self.setup_chat_tab()

        # About tab
        self.setup_about_tab()
    
    def setup_control_tab(self):
        """Setup the main control tab"""
        control_frame = ttk.Frame(self.notebook)
        self.notebook.add(control_frame, text="Control Panel")
        
        # Status section
        status_frame = ttk.LabelFrame(control_frame, text="Service Status", padding=10)
        status_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # API Server status
        api_frame = ttk.Frame(status_frame)
        api_frame.pack(fill=tk.X, pady=2)
        ttk.Label(api_frame, text="API Server:", width=15).pack(side=tk.LEFT)
        self.api_status_label = ttk.Label(api_frame, text="Stopped", foreground="red")
        self.api_status_label.pack(side=tk.LEFT, padx=10)
        ttk.Button(api_frame, text="Start", command=self.start_api).pack(side=tk.RIGHT, padx=2)
        ttk.Button(api_frame, text="Stop", command=self.stop_api).pack(side=tk.RIGHT, padx=2)
        
        # Desktop App status
        desktop_frame = ttk.Frame(status_frame)
        desktop_frame.pack(fill=tk.X, pady=2)
        ttk.Label(desktop_frame, text="Desktop App:", width=15).pack(side=tk.LEFT)
        self.desktop_status_label = ttk.Label(desktop_frame, text="Stopped", foreground="red")
        self.desktop_status_label.pack(side=tk.LEFT, padx=10)
        ttk.Button(desktop_frame, text="Start", command=self.start_desktop).pack(side=tk.RIGHT, padx=2)
        ttk.Button(desktop_frame, text="Stop", command=self.stop_desktop).pack(side=tk.RIGHT, padx=2)
        
        # Ollama status
        ollama_frame = ttk.Frame(status_frame)
        ollama_frame.pack(fill=tk.X, pady=2)
        ttk.Label(ollama_frame, text="Ollama:", width=15).pack(side=tk.LEFT)
        self.ollama_status_label = ttk.Label(ollama_frame, text="Checking...", foreground="orange")
        self.ollama_status_label.pack(side=tk.LEFT, padx=10)
        ttk.Button(ollama_frame, text="Check", command=self.check_ollama).pack(side=tk.RIGHT, padx=2)
        
        # Quick actions section
        actions_frame = ttk.LabelFrame(control_frame, text="Quick Actions", padding=10)
        actions_frame.pack(fill=tk.X, padx=10, pady=5)
        
        actions_row1 = ttk.Frame(actions_frame)
        actions_row1.pack(fill=tk.X, pady=2)
        ttk.Button(actions_row1, text="Open Web Interface", command=self.open_web_interface).pack(side=tk.LEFT, padx=5)
        ttk.Button(actions_row1, text="Open Data Directory", command=self.open_data_directory).pack(side=tk.LEFT, padx=5)
        ttk.Button(actions_row1, text="Install Dependencies", command=self.install_dependencies).pack(side=tk.LEFT, padx=5)
        
        actions_row2 = ttk.Frame(actions_frame)
        actions_row2.pack(fill=tk.X, pady=2)
        ttk.Button(actions_row2, text="Index Documents", command=self.index_documents).pack(side=tk.LEFT, padx=5)
        ttk.Button(actions_row2, text="View Logs", command=lambda: self.notebook.select(2)).pack(side=tk.LEFT, padx=5)
        ttk.Button(actions_row2, text="Restart All", command=self.restart_all).pack(side=tk.LEFT, padx=5)
        
        # System info section
        info_frame = ttk.LabelFrame(control_frame, text="System Information", padding=10)
        info_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.info_text = scrolledtext.ScrolledText(info_frame, height=8, state=tk.DISABLED)
        self.info_text.pack(fill=tk.BOTH, expand=True)
        
        self.update_system_info()
    
    def setup_config_tab(self):
        """Setup the configuration tab"""
        config_frame = ttk.Frame(self.notebook)
        self.notebook.add(config_frame, text="Configuration")
        
        # Configuration form
        form_frame = ttk.LabelFrame(config_frame, text="Settings", padding=10)
        form_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # API settings
        ttk.Label(form_frame, text="API Host:").grid(row=0, column=0, sticky=tk.W, pady=2)
        self.api_host_var = tk.StringVar(value=self.config['api_host'])
        ttk.Entry(form_frame, textvariable=self.api_host_var, width=30).grid(row=0, column=1, sticky=tk.W, padx=10, pady=2)
        
        ttk.Label(form_frame, text="API Port:").grid(row=1, column=0, sticky=tk.W, pady=2)
        self.api_port_var = tk.StringVar(value=str(self.config['api_port']))
        ttk.Entry(form_frame, textvariable=self.api_port_var, width=30).grid(row=1, column=1, sticky=tk.W, padx=10, pady=2)
        
        ttk.Label(form_frame, text="Ollama URL:").grid(row=2, column=0, sticky=tk.W, pady=2)
        self.ollama_url_var = tk.StringVar(value=self.config['ollama_url'])
        ttk.Entry(form_frame, textvariable=self.ollama_url_var, width=30).grid(row=2, column=1, sticky=tk.W, padx=10, pady=2)
        
        ttk.Label(form_frame, text="Corpus Path:").grid(row=3, column=0, sticky=tk.W, pady=2)
        self.corpus_path_var = tk.StringVar(value=self.config['corpus_path'])
        corpus_frame = ttk.Frame(form_frame)
        corpus_frame.grid(row=3, column=1, sticky=tk.W, padx=10, pady=2)
        ttk.Entry(corpus_frame, textvariable=self.corpus_path_var, width=25).pack(side=tk.LEFT)
        ttk.Button(corpus_frame, text="Browse", command=self.browse_corpus_path).pack(side=tk.LEFT, padx=5)
        
        # Save button
        ttk.Button(form_frame, text="Save Configuration", command=self.save_config).grid(row=4, column=0, columnspan=2, pady=10)
    
    def setup_logs_tab(self):
        """Setup the logs tab"""
        logs_frame = ttk.Frame(self.notebook)
        self.notebook.add(logs_frame, text="Logs")
        
        # Log controls
        controls_frame = ttk.Frame(logs_frame)
        controls_frame.pack(fill=tk.X, padx=10, pady=5)
        
        ttk.Button(controls_frame, text="Clear Logs", command=self.clear_logs).pack(side=tk.LEFT, padx=5)
        ttk.Button(controls_frame, text="Refresh", command=self.refresh_logs).pack(side=tk.LEFT, padx=5)
        ttk.Button(controls_frame, text="Export Logs", command=self.export_logs).pack(side=tk.LEFT, padx=5)
        
        # Log display
        self.log_text = scrolledtext.ScrolledText(logs_frame, height=25, state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

    def setup_chat_tab(self):
        """Setup the chat interface tab"""
        chat_frame = ttk.Frame(self.notebook)
        self.notebook.add(chat_frame, text="Chat Interface")

        # Chat controls
        controls_frame = ttk.Frame(chat_frame)
        controls_frame.pack(fill=tk.X, padx=10, pady=5)

        ttk.Label(controls_frame, text="AI Agent Chat Interface", font=('Arial', 12, 'bold')).pack(side=tk.LEFT)

        # Connection status
        self.chat_status_frame = ttk.Frame(controls_frame)
        self.chat_status_frame.pack(side=tk.RIGHT)

        self.chat_status_label = ttk.Label(self.chat_status_frame, text="●", foreground="red")
        self.chat_status_label.pack(side=tk.LEFT)
        ttk.Label(self.chat_status_frame, text="Disconnected").pack(side=tk.LEFT, padx=(2, 0))

        # Chat display area
        chat_display_frame = ttk.Frame(chat_frame)
        chat_display_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Chat history
        self.chat_history = scrolledtext.ScrolledText(
            chat_display_frame,
            height=20,
            state=tk.DISABLED,
            wrap=tk.WORD,
            font=('Consolas', 10)
        )
        self.chat_history.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # Configure text tags for styling
        self.chat_history.tag_configure("user", foreground="#2563eb", font=('Consolas', 10, 'bold'))
        self.chat_history.tag_configure("assistant", foreground="#059669", font=('Consolas', 10))
        self.chat_history.tag_configure("system", foreground="#dc2626", font=('Consolas', 9, 'italic'))
        self.chat_history.tag_configure("timestamp", foreground="#6b7280", font=('Consolas', 8))

        # Input area
        input_frame = ttk.Frame(chat_display_frame)
        input_frame.pack(fill=tk.X, pady=(0, 5))

        # Message input
        ttk.Label(input_frame, text="Message:").pack(anchor=tk.W)

        input_container = ttk.Frame(input_frame)
        input_container.pack(fill=tk.X, pady=(2, 0))

        self.chat_input = tk.Text(
            input_container,
            height=3,
            wrap=tk.WORD,
            font=('Consolas', 10)
        )
        self.chat_input.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))

        # Send button
        self.send_button = ttk.Button(
            input_container,
            text="Send",
            command=self.send_chat_message,
            width=10
        )
        self.send_button.pack(side=tk.RIGHT, fill=tk.Y)

        # Bind Enter key to send message
        self.chat_input.bind('<Control-Return>', lambda e: self.send_chat_message())

        # Action buttons
        action_frame = ttk.Frame(chat_display_frame)
        action_frame.pack(fill=tk.X, pady=(5, 0))

        ttk.Button(action_frame, text="Clear Chat", command=self.clear_chat).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(action_frame, text="Export Chat", command=self.export_chat).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(action_frame, text="Test Connection", command=self.test_chat_connection).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(action_frame, text="Start API Server", command=self.start_api).pack(side=tk.LEFT, padx=(0, 5))

        # Initialize chat
        self.chat_messages = []
        self.add_chat_message("system", "Chat interface initialized. Test the connection to start chatting with the AI agent.")
        self.test_chat_connection()
    
    def setup_about_tab(self):
        """Setup the about tab"""
        about_frame = ttk.Frame(self.notebook)
        self.notebook.add(about_frame, text="About")
        
        about_text = """
IP2M METRR Copilot Control Panel
Version 0.1.0

This application provides a graphical interface for managing the IP2M METRR 
Copilot system, which includes:

• API Server - RESTful API for assessment data and AI services
• Desktop Application - Electron-based GUI for assessments
• Document Indexer - RAG pipeline for document processing
• Ollama Integration - Local AI model inference

Features:
• Start/stop system components
• Monitor service status
• Configure system settings
• View system logs
• Index documents for RAG
• Check dependencies

Requirements:
• Python 3.8+
• Node.js 18+
• pnpm package manager
• Ollama (optional)

For more information, visit the project documentation.
        """
        
        about_label = ttk.Label(about_frame, text=about_text, justify=tk.LEFT, padding=20)
        about_label.pack(fill=tk.BOTH, expand=True)
    
    def log_message(self, message: str, level: str = "INFO"):
        """Add a message to the log display"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}\n"
        
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, log_entry)
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        
        # Also print to console
        print(log_entry.strip())
    
    def run_command(self, command: List[str], cwd: Optional[Path] = None) -> subprocess.Popen:
        """Run a command and return the process"""
        if cwd is None:
            cwd = self.project_root
        
        self.log_message(f"Running command: {' '.join(command)}")
        
        try:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            return process
        except Exception as e:
            self.log_message(f"Failed to run command: {e}", "ERROR")
            raise
    
    def start_api(self):
        """Start the API server"""
        if self.processes.get('api'):
            self.log_message("API server is already running")
            return
        
        try:
            process = self.run_command(['pnpm', 'dev:api'])
            self.processes['api'] = process
            self.process_status['api'] = 'starting'
            self.log_message("API server starting...")
            
            # Monitor process in background
            threading.Thread(target=self.monitor_process, args=('api', process), daemon=True).start()
            
        except Exception as e:
            self.log_message(f"Failed to start API server: {e}", "ERROR")
    
    def stop_api(self):
        """Stop the API server"""
        self.stop_process('api')
    
    def start_desktop(self):
        """Start the desktop application"""
        if self.processes.get('desktop'):
            self.log_message("Desktop app is already running")
            return
        
        try:
            process = self.run_command(['pnpm', 'dev:desktop'])
            self.processes['desktop'] = process
            self.process_status['desktop'] = 'starting'
            self.log_message("Desktop app starting...")
            
            # Monitor process in background
            threading.Thread(target=self.monitor_process, args=('desktop', process), daemon=True).start()
            
        except Exception as e:
            self.log_message(f"Failed to start desktop app: {e}", "ERROR")
    
    def stop_desktop(self):
        """Stop the desktop application"""
        self.stop_process('desktop')
    
    def stop_process(self, name: str):
        """Stop a named process"""
        process = self.processes.get(name)
        if process:
            try:
                process.terminate()
                process.wait(timeout=5)
                self.log_message(f"{name.title()} stopped")
            except subprocess.TimeoutExpired:
                process.kill()
                self.log_message(f"{name.title()} force killed")
            except Exception as e:
                self.log_message(f"Error stopping {name}: {e}", "ERROR")
            finally:
                del self.processes[name]
                self.process_status[name] = 'stopped'
    
    def monitor_process(self, name: str, process: subprocess.Popen):
        """Monitor a process and update status"""
        try:
            # Wait a bit for process to start
            time.sleep(2)
            
            if process.poll() is None:
                self.process_status[name] = 'running'
                self.log_message(f"{name.title()} started successfully")
            
            # Wait for process to complete
            process.wait()
            
            if name in self.processes:
                del self.processes[name]
            self.process_status[name] = 'stopped'
            self.log_message(f"{name.title()} stopped")
            
        except Exception as e:
            self.log_message(f"Error monitoring {name}: {e}", "ERROR")
            self.process_status[name] = 'error'
    
    def check_ollama(self):
        """Check if Ollama is running"""
        def check():
            try:
                response = requests.get(f"{self.config['ollama_url']}/api/tags", timeout=5)
                if response.status_code == 200:
                    self.ollama_status_label.config(text="Running", foreground="green")
                    models = response.json().get('models', [])
                    self.log_message(f"Ollama is running with {len(models)} models")
                else:
                    self.ollama_status_label.config(text="Error", foreground="red")
                    self.log_message("Ollama responded with error", "WARNING")
            except Exception as e:
                self.ollama_status_label.config(text="Not Running", foreground="red")
                self.log_message(f"Ollama not accessible: {e}", "WARNING")
        
        threading.Thread(target=check, daemon=True).start()
    
    def check_dependencies(self):
        """Check if required dependencies are installed"""
        def check():
            # Check Node.js
            try:
                result = subprocess.run(['node', '--version'], capture_output=True, text=True)
                if result.returncode == 0:
                    self.log_message(f"Node.js version: {result.stdout.strip()}")
                else:
                    self.log_message("Node.js not found", "WARNING")
            except:
                self.log_message("Node.js not found", "WARNING")
            
            # Check pnpm
            try:
                result = subprocess.run(['pnpm', '--version'], capture_output=True, text=True)
                if result.returncode == 0:
                    self.log_message(f"pnpm version: {result.stdout.strip()}")
                else:
                    self.log_message("pnpm not found", "WARNING")
            except:
                self.log_message("pnpm not found", "WARNING")
            
            # Check Ollama
            self.check_ollama()
        
        threading.Thread(target=check, daemon=True).start()
    
    def start_status_monitor(self):
        """Start the status monitoring loop"""
        def update_status():
            # Update status labels
            for service in ['api', 'desktop']:
                status = self.process_status[service]
                label = getattr(self, f"{service}_status_label")
                
                if status == 'running':
                    label.config(text="Running", foreground="green")
                elif status == 'starting':
                    label.config(text="Starting...", foreground="orange")
                elif status == 'error':
                    label.config(text="Error", foreground="red")
                else:
                    label.config(text="Stopped", foreground="red")
            
            # Schedule next update
            self.root.after(2000, update_status)
        
        update_status()
    
    def update_system_info(self):
        """Update the system information display"""
        info = []
        info.append(f"Project Root: {self.project_root}")
        info.append(f"Python Version: {sys.version}")
        info.append(f"Platform: {sys.platform}")
        info.append(f"API URL: http://{self.config['api_host']}:{self.config['api_port']}")
        info.append(f"Desktop URL: http://localhost:{self.config.get('desktop_port', 3000)}")
        info.append(f"Ollama URL: {self.config['ollama_url']}")
        info.append(f"Corpus Path: {self.config['corpus_path']}")
        info.append(f"Database Path: {self.config['db_path']}")
        
        self.info_text.config(state=tk.NORMAL)
        self.info_text.delete(1.0, tk.END)
        self.info_text.insert(1.0, "\n".join(info))
        self.info_text.config(state=tk.DISABLED)
    
    def open_web_interface(self):
        """Open the web interface in browser"""
        url = f"http://localhost:{self.config.get('desktop_port', 3000)}"
        webbrowser.open(url)
        self.log_message(f"Opening web interface: {url}")
    
    def open_data_directory(self):
        """Open the data directory in file explorer"""
        data_path = self.project_root / "data"
        if data_path.exists():
            if sys.platform == "win32":
                os.startfile(data_path)
            elif sys.platform == "darwin":
                subprocess.run(["open", data_path])
            else:
                subprocess.run(["xdg-open", data_path])
        else:
            messagebox.showwarning("Warning", f"Data directory not found: {data_path}")
    
    def install_dependencies(self):
        """Install project dependencies"""
        def install():
            try:
                self.log_message("Installing dependencies...")
                process = self.run_command(['pnpm', 'install'])
                process.wait()
                
                if process.returncode == 0:
                    self.log_message("Dependencies installed successfully")
                else:
                    self.log_message("Failed to install dependencies", "ERROR")
            except Exception as e:
                self.log_message(f"Error installing dependencies: {e}", "ERROR")
        
        threading.Thread(target=install, daemon=True).start()
    
    def index_documents(self):
        """Open document indexing dialog"""
        file_path = filedialog.askdirectory(title="Select directory to index")
        if file_path:
            def index():
                try:
                    self.log_message(f"Indexing documents from: {file_path}")
                    process = self.run_command(['pnpm', 'run', 'indexer', 'batch', file_path])
                    process.wait()
                    
                    if process.returncode == 0:
                        self.log_message("Document indexing completed")
                    else:
                        self.log_message("Document indexing failed", "ERROR")
                except Exception as e:
                    self.log_message(f"Error indexing documents: {e}", "ERROR")
            
            threading.Thread(target=index, daemon=True).start()
    
    def restart_all(self):
        """Restart all services"""
        self.log_message("Restarting all services...")
        
        # Stop all processes
        for name in list(self.processes.keys()):
            self.stop_process(name)
        
        # Wait a moment
        time.sleep(2)
        
        # Start services
        self.start_api()
        time.sleep(3)
        self.start_desktop()
    
    def browse_corpus_path(self):
        """Browse for corpus path"""
        path = filedialog.askdirectory(title="Select corpus directory")
        if path:
            self.corpus_path_var.set(path)
    
    def save_config(self):
        """Save configuration to .env.local"""
        try:
            env_content = []
            env_content.append(f"API_HOST={self.api_host_var.get()}")
            env_content.append(f"API_PORT={self.api_port_var.get()}")
            env_content.append(f"OLLAMA_URL={self.ollama_url_var.get()}")
            env_content.append(f"CORPUS_PATH={self.corpus_path_var.get()}")
            
            env_file = self.project_root / '.env.local'
            with open(env_file, 'w') as f:
                f.write("\n".join(env_content))
            
            # Update internal config
            self.config['api_host'] = self.api_host_var.get()
            self.config['api_port'] = int(self.api_port_var.get())
            self.config['ollama_url'] = self.ollama_url_var.get()
            self.config['corpus_path'] = self.corpus_path_var.get()
            
            self.log_message("Configuration saved successfully")
            self.update_system_info()
            
        except Exception as e:
            self.log_message(f"Error saving configuration: {e}", "ERROR")
            messagebox.showerror("Error", f"Failed to save configuration: {e}")
    
    def clear_logs(self):
        """Clear the log display"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
    
    def refresh_logs(self):
        """Refresh logs from log files"""
        # This could read from actual log files if they exist
        self.log_message("Logs refreshed")
    
    def export_logs(self):
        """Export logs to file"""
        file_path = filedialog.asksaveasfilename(
            title="Export logs",
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("Text files", "*.txt"), ("All files", "*.*")]
        )
        
        if file_path:
            try:
                content = self.log_text.get(1.0, tk.END)
                with open(file_path, 'w') as f:
                    f.write(content)
                self.log_message(f"Logs exported to: {file_path}")
            except Exception as e:
                self.log_message(f"Error exporting logs: {e}", "ERROR")

    def add_chat_message(self, sender: str, message: str, timestamp: Optional[str] = None):
        """Add a message to the chat history"""
        if timestamp is None:
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")

        self.chat_history.config(state=tk.NORMAL)

        # Add timestamp
        self.chat_history.insert(tk.END, f"[{timestamp}] ", "timestamp")

        # Add sender and message
        if sender == "user":
            self.chat_history.insert(tk.END, "You: ", "user")
        elif sender == "assistant":
            self.chat_history.insert(tk.END, "AI Agent: ", "assistant")
        elif sender == "system":
            self.chat_history.insert(tk.END, "System: ", "system")

        self.chat_history.insert(tk.END, f"{message}\n\n")

        self.chat_history.config(state=tk.DISABLED)
        self.chat_history.see(tk.END)

        # Store message
        self.chat_messages.append({
            "sender": sender,
            "message": message,
            "timestamp": timestamp
        })

    def send_chat_message(self):
        """Send a message to the AI agent"""
        message = self.chat_input.get("1.0", tk.END).strip()
        if not message:
            return

        # Clear input
        self.chat_input.delete("1.0", tk.END)

        # Add user message to chat
        self.add_chat_message("user", message)

        # Disable send button while processing
        self.send_button.config(state=tk.DISABLED, text="Sending...")

        # Send message in a separate thread
        threading.Thread(target=self._send_message_async, args=(message,), daemon=True).start()

    def _send_message_async(self, message: str):
        """Send message to AI agent asynchronously"""
        try:
            # Get API configuration
            api_host = self.config.get('api_host', 'localhost')
            api_port = self.config.get('api_port', 4317)
            api_url = f"http://{api_host}:{api_port}/api/rag/ask"

            # Prepare request
            payload = {
                "question": message,
                "topK": 12,
                "rerankTopK": 6,
                "enableReranking": True
            }

            # Make request
            response = requests.post(
                api_url,
                json=payload,
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    ai_response = data['response']['answer']
                    confidence = data['response'].get('overallConfidence', 0)

                    # Format response with confidence
                    formatted_response = f"{ai_response}\n\n[Confidence: {confidence:.2f}]"

                    # Add AI response to chat
                    self.root.after(0, lambda: self.add_chat_message("assistant", formatted_response))

                    # Update connection status
                    self.root.after(0, self.update_chat_status, True)
                else:
                    error_msg = data.get('error', 'Unknown error occurred')
                    self.root.after(0, lambda: self.add_chat_message("system", f"Error: {error_msg}"))
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                self.root.after(0, lambda: self.add_chat_message("system", f"API Error: {error_msg}"))
                self.root.after(0, self.update_chat_status, False)

        except requests.exceptions.ConnectionError:
            # Provide a mock response when API server is not available
            self.root.after(0, lambda: self.add_chat_message("system", "⚠️ API server not running. Using mock response for demonstration."))

            # Generate a mock response based on the message
            mock_response = self._generate_mock_response(message)
            self.root.after(0, lambda: self.add_chat_message("assistant", mock_response))
            self.root.after(0, self.update_chat_status, False)

        except requests.exceptions.Timeout:
            self.root.after(0, lambda: self.add_chat_message("system", "Request timeout: The AI agent took too long to respond."))
        except Exception as e:
            self.root.after(0, lambda: self.add_chat_message("system", f"Unexpected error: {str(e)}"))
        finally:
            # Re-enable send button
            self.root.after(0, lambda: self.send_button.config(state=tk.NORMAL, text="Send"))

    def _generate_mock_response(self, message: str) -> str:
        """Generate a mock response for demonstration purposes"""
        message_lower = message.lower()

        if any(word in message_lower for word in ['hello', 'hi', 'hey']):
            return "Hello! I'm the IP2M METRR Copilot AI agent. I can help you with information security assessments, compliance frameworks, and risk management. How can I assist you today?\n\n[Mock Response - Start API server for full functionality]"

        elif any(word in message_lower for word in ['ip2m', 'metrr']):
            return "IP2M METRR (Information Protection Maturity Model - Maturity Evaluation and Risk Rating) is a comprehensive framework for assessing organizational information security maturity. It provides structured evaluation criteria across multiple domains including governance, risk management, and technical controls.\n\n[Mock Response - Confidence: 0.85]"

        elif any(word in message_lower for word in ['security', 'cybersecurity']):
            return "Information security involves protecting digital assets through a combination of technical controls, policies, and procedures. Key areas include:\n\n• Access Control & Identity Management\n• Data Protection & Encryption\n• Network Security\n• Incident Response\n• Security Awareness Training\n\nWould you like me to elaborate on any specific area?\n\n[Mock Response - Confidence: 0.92]"

        elif any(word in message_lower for word in ['help', 'what', 'how']):
            return "I can assist you with:\n\n🔒 Security Framework Analysis\n📊 Risk Assessment Guidance\n📋 Compliance Requirements\n🛡️ Control Implementation\n📈 Maturity Model Evaluation\n\nTo get started with the full AI capabilities, please ensure the API server is running using the 'Start' button in the Control Panel.\n\n[Mock Response - Confidence: 0.88]"

        else:
            return f"I understand you're asking about: '{message}'\n\nThis is a mock response since the API server is not currently running. To get accurate, evidence-based answers from the RAG pipeline, please:\n\n1. Start the API server from the Control Panel\n2. Ensure Ollama is running with the required models\n3. Check that documents are indexed in the system\n\nOnce connected, I'll provide detailed responses with source citations and confidence scores.\n\n[Mock Response - Please start API server]"

    def update_chat_status(self, connected: bool):
        """Update chat connection status"""
        if connected:
            self.chat_status_label.config(foreground="green")
            # Find the status text label and update it
            for child in self.chat_status_frame.winfo_children():
                if isinstance(child, ttk.Label) and child != self.chat_status_label:
                    child.config(text="Connected")
                    break
        else:
            self.chat_status_label.config(foreground="red")
            # Find the status text label and update it
            for child in self.chat_status_frame.winfo_children():
                if isinstance(child, ttk.Label) and child != self.chat_status_label:
                    child.config(text="Disconnected")
                    break

    def test_chat_connection(self):
        """Test connection to the AI agent API"""
        def test_async():
            try:
                api_host = self.config.get('api_host', 'localhost')
                api_port = self.config.get('api_port', 4317)
                health_url = f"http://{api_host}:{api_port}/health"

                response = requests.get(health_url, timeout=5)
                if response.status_code == 200:
                    self.root.after(0, self.update_chat_status, True)
                    self.root.after(0, lambda: self.add_chat_message("system", "✅ Connection test successful. AI agent is ready for full functionality."))
                else:
                    self.root.after(0, self.update_chat_status, False)
                    self.root.after(0, lambda: self.add_chat_message("system", f"❌ Connection test failed: HTTP {response.status_code}. Mock responses will be used."))
            except requests.exceptions.ConnectionError:
                self.root.after(0, self.update_chat_status, False)
                self.root.after(0, lambda: self.add_chat_message("system", "⚠️ API server not running. Chat interface will use mock responses for demonstration. Start the API server from the Control Panel for full functionality."))
            except Exception as e:
                self.root.after(0, self.update_chat_status, False)
                self.root.after(0, lambda: self.add_chat_message("system", f"❌ Connection test failed: {str(e)}. Mock responses will be used."))

        threading.Thread(target=test_async, daemon=True).start()

    def clear_chat(self):
        """Clear the chat history"""
        result = messagebox.askyesno("Clear Chat", "Are you sure you want to clear the chat history?")
        if result:
            self.chat_history.config(state=tk.NORMAL)
            self.chat_history.delete("1.0", tk.END)
            self.chat_history.config(state=tk.DISABLED)
            self.chat_messages.clear()
            self.add_chat_message("system", "Chat history cleared.")

    def export_chat(self):
        """Export chat history to a file"""
        if not self.chat_messages:
            messagebox.showinfo("Export Chat", "No chat history to export.")
            return

        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
            title="Export Chat History"
        )

        if filename:
            try:
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write("IP2M METRR Copilot - Chat History\n")
                    f.write("=" * 50 + "\n\n")

                    for msg in self.chat_messages:
                        f.write(f"[{msg['timestamp']}] {msg['sender'].title()}: {msg['message']}\n\n")

                messagebox.showinfo("Export Chat", f"Chat history exported to {filename}")
            except Exception as e:
                messagebox.showerror("Export Error", f"Failed to export chat history: {str(e)}")

    def on_closing(self):
        """Handle application closing"""
        # Stop all processes
        for name in list(self.processes.keys()):
            self.stop_process(name)
        
        self.root.destroy()

def main():
    """Main entry point"""
    root = tk.Tk()
    app = IP2MControlPanel(root)
    
    # Handle window closing
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    # Start the GUI
    root.mainloop()

if __name__ == "__main__":
    main()
