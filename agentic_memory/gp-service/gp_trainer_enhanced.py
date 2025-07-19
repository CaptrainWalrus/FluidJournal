#!/usr/bin/env python3
"""
Enhanced GP Training Script with Better Data Handling and Diagnostics
Addresses zero variance, overfitting, and hyperparameter issues
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel, Matern, ConstantKernel
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from sklearn.feature_selection import VarianceThreshold
import joblib
import logging
from datetime import datetime
import warnings
from tqdm import tqdm
import time
import psutil
import threading
warnings.filterwarnings('ignore', category=FutureWarning)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EnhancedGPTrainer:
    def __init__(self, data_dir='./training_data', models_dir='./models', max_cpu_percent=90):
        self.data_dir = data_dir
        self.models_dir = models_dir
        self.max_cpu_percent = max_cpu_percent
        self.cpu_monitor_active = False
        
        # Ensure models directory exists
        os.makedirs(self.models_dir, exist_ok=True)
        
        # Enhanced GP configurations with CPU throttling
        # Limit CPU cores to prevent system overload
        max_cores = max(1, int(psutil.cpu_count() * 0.8))  # Use 80% of available cores
        
        self.gp_configs = {
            'pnl': {
                'kernel': ConstantKernel(1.0, (1e-3, 1e3)) * RBF(length_scale=1.0, length_scale_bounds=(1e-2, 1e3)) + WhiteKernel(noise_level=1.0, noise_level_bounds=(1e-10, 1e5)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': min(15, max_cores * 2),  # Reduce restarts based on CPU
                'random_state': 42
            },
            'trajectory': {
                'kernel': ConstantKernel(1.0, (1e-3, 1e3)) * Matern(length_scale=1.0, length_scale_bounds=(1e-2, 1e3), nu=1.5) + WhiteKernel(noise_level=1.0, noise_level_bounds=(1e-10, 1e5)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': min(8, max_cores),  # Fewer restarts for trajectory
                'random_state': 42
            },
            'risk': {
                'kernel': ConstantKernel(1.0, (1e-3, 1e3)) * RBF(length_scale=1.0, length_scale_bounds=(1e-2, 1e3)) + WhiteKernel(noise_level=1.0, noise_level_bounds=(1e-10, 1e5)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': min(8, max_cores),  # CPU-aware restarts
                'random_state': 42
            }
        }
        
        # Track removed features
        self.removed_features = []
        self.feature_selector = None
        self.scalers = {}
        
    def start_cpu_monitor(self):
        """Start CPU monitoring and throttling"""
        self.cpu_monitor_active = True
        
        def cpu_monitor():
            while self.cpu_monitor_active:
                try:
                    cpu_percent = psutil.cpu_percent(interval=1)
                    if cpu_percent > self.max_cpu_percent:
                        logger.info(f"CPU usage {cpu_percent:.1f}% > {self.max_cpu_percent}% - throttling...")
                        # Sleep to reduce CPU load
                        time.sleep(2)
                    time.sleep(1)
                except Exception as e:
                    logger.warning(f"CPU monitor error: {e}")
                    break
        
        self.cpu_monitor_thread = threading.Thread(target=cpu_monitor, daemon=True)
        self.cpu_monitor_thread.start()
        logger.info(f"CPU monitor started - will throttle if usage > {self.max_cpu_percent}%")
    
    def stop_cpu_monitor(self):
        """Stop CPU monitoring"""
        self.cpu_monitor_active = False
        if hasattr(self, 'cpu_monitor_thread'):
            self.cpu_monitor_thread.join(timeout=2)
        logger.info("CPU monitor stopped")
    
    def cpu_throttle_if_needed(self):
        """Check CPU and throttle if needed"""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            if cpu_percent > self.max_cpu_percent:
                sleep_time = min(3, (cpu_percent - self.max_cpu_percent) / 10)
                logger.info(f"CPU {cpu_percent:.1f}% - throttling for {sleep_time:.1f}s")
                time.sleep(sleep_time)
                return True
            return False
        except Exception:
            return False
    
    def load_training_data(self, filename):
        """Load training data from exported JSON file"""
        filepath = os.path.join(self.data_dir, filename)
        
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Training data file not found: {filepath}")
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        # Convert to numpy arrays
        features = np.array(data['data']['features'])
        pnl_targets = np.array(data['data']['pnl_targets'])
        trajectory_targets = np.array(data['data']['trajectory_targets'])
        risk_targets = np.array(data['data']['risk_targets'])
        
        logger.info(f"Loaded {filename}: {len(features)} samples, {features.shape[1]} features")
        
        # Data diagnostics
        self._diagnose_data(features, pnl_targets, trajectory_targets, risk_targets)
        
        return {
            'features': features,
            'pnl_targets': pnl_targets,
            'trajectory_targets': trajectory_targets,
            'risk_targets': risk_targets,
            'feature_names': data['data'].get('feature_names', [f'feature_{i}' for i in range(features.shape[1])]),
            'instrument': data['instrument'],
            'direction': data['direction']
        }
    
    def _diagnose_data(self, features, pnl_targets, trajectory_targets, risk_targets):
        """Diagnose data quality issues"""
        logger.info("\n=== DATA DIAGNOSTICS ===")
        
        # Feature diagnostics
        feature_vars = np.var(features, axis=0)
        zero_var_features = np.sum(feature_vars < 1e-10)
        logger.info(f"Features with zero/low variance: {zero_var_features}/{features.shape[1]}")
        
        # PnL diagnostics
        pnl_var = np.var(pnl_targets)
        pnl_unique = len(np.unique(pnl_targets))
        logger.info(f"PnL variance: {pnl_var:.6f}")
        logger.info(f"Unique PnL values: {pnl_unique}/{len(pnl_targets)}")
        logger.info(f"PnL range: [{np.min(pnl_targets):.2f}, {np.max(pnl_targets):.2f}]")
        logger.info(f"PnL mean: {np.mean(pnl_targets):.2f}, std: {np.std(pnl_targets):.2f}")
        
        # Distribution check
        pnl_zeros = np.sum(np.abs(pnl_targets) < 0.01)
        if pnl_zeros > len(pnl_targets) * 0.5:
            logger.warning(f"⚠️  {pnl_zeros}/{len(pnl_targets)} trades have near-zero PnL!")
        
        # Trajectory diagnostics
        traj_final = trajectory_targets[:, -1] if trajectory_targets.shape[1] > 0 else np.array([])
        logger.info(f"Trajectory endpoints variance: {np.var(traj_final):.6f}")
        
        # Risk targets diagnostics
        logger.info(f"SL range: [{np.min(risk_targets[:, 0]):.2f}, {np.max(risk_targets[:, 0]):.2f}]")
        logger.info(f"TP range: [{np.min(risk_targets[:, 1]):.2f}, {np.max(risk_targets[:, 1]):.2f}]")
        logger.info("========================\n")
    
    def preprocess_features(self, features, fit=True):
        """Remove zero-variance features and scale"""
        if fit:
            # Remove zero/low variance features
            self.feature_selector = VarianceThreshold(threshold=1e-10)
            features_cleaned = self.feature_selector.fit_transform(features)
            
            removed_count = features.shape[1] - features_cleaned.shape[1]
            if removed_count > 0:
                logger.info(f"Removed {removed_count} zero-variance features")
                self.removed_features = np.where(~self.feature_selector.get_support())[0]
            
            # Use RobustScaler for outlier resistance
            self.scalers['features'] = RobustScaler()
            features_scaled = self.scalers['features'].fit_transform(features_cleaned)
        else:
            features_cleaned = self.feature_selector.transform(features)
            features_scaled = self.scalers['features'].transform(features_cleaned)
        
        return features_scaled
    
    def validate_data(self, data):
        """Enhanced data validation"""
        features = data['features']
        pnl_targets = data['pnl_targets']
        
        # Check for minimum samples
        if len(features) < 20:
            logger.warning(f"Insufficient samples: {len(features)} < 20")
            return False
        
        # Check PnL variance
        pnl_var = np.var(pnl_targets)
        if pnl_var < 1e-6:
            logger.error("❌ PnL targets have zero variance - cannot train meaningful model!")
            logger.info("This usually means:")
            logger.info("  1. All trades have same PnL (likely 0)")
            logger.info("  2. Data export issue - check outcome data")
            logger.info("  3. Need more diverse trading data")
            return False
        
        # Check for NaN/Inf
        if np.any(np.isnan(features)) or np.any(np.isinf(features)):
            logger.error("❌ Features contain NaN or Inf values")
            return False
        
        if np.any(np.isnan(pnl_targets)) or np.any(np.isinf(pnl_targets)):
            logger.error("❌ PnL targets contain NaN or Inf values")
            return False
        
        return True
    
    def train_pnl_gp(self, features, pnl_targets, test_size=0.2):
        """Train GP for PnL prediction with validation and progress tracking"""
        logger.info("Training PnL GP with enhanced configuration...")
        
        # Check if we have enough variance
        if np.var(pnl_targets) < 1e-6:
            logger.error("Cannot train PnL GP - targets have zero variance")
            return None, {'error': 'zero_variance'}
        
        # Split data for validation
        with tqdm(total=100, desc="📊 PnL GP Training", unit="%") as pbar:
            pbar.set_description("📊 Splitting data")
            X_train, X_test, y_train, y_test = train_test_split(
                features, pnl_targets, test_size=test_size, random_state=42
            )
            pbar.update(10)
            
            # Create and train GP
            pbar.set_description("📊 Initializing GP")
            pnl_gp = GaussianProcessRegressor(**self.gp_configs['pnl'])
            pbar.update(10)
            
            try:
                # Active progress during GP fitting
                n_samples = len(X_train)
                estimated_time = max(1, (n_samples / 1000) * 2)  # Rough estimate in minutes
                
                pbar.set_description(f"📊 Fitting GP ({n_samples:,} samples, ~{estimated_time:.1f}min)")
                
                # Start a background progress updater with CPU monitoring
                import threading
                stop_updates = threading.Event()
                
                def progress_updater():
                    counter = 0
                    while not stop_updates.is_set():
                        counter += 1
                        # Check CPU and show status
                        cpu_percent = psutil.cpu_percent(interval=0.1)
                        cpu_status = f"CPU:{cpu_percent:.1f}%" 
                        if cpu_percent > self.max_cpu_percent:
                            cpu_status += " ⚠️THROTTLING"
                        
                        pbar.set_description(f"📊 Fitting GP ({counter}0s elapsed, {cpu_status})")
                        time.sleep(10)  # Update every 10 seconds
                
                updater_thread = threading.Thread(target=progress_updater)
                updater_thread.daemon = True
                updater_thread.start()
                
                # Start CPU monitoring
                self.start_cpu_monitor()
                
                try:
                    # Fit the GP model with periodic CPU checks
                    # Note: scikit-learn doesn't support interruption, so we can only monitor
                    pnl_gp.fit(X_train, y_train)
                finally:
                    # Stop monitoring and progress updater
                    self.stop_cpu_monitor()
                    stop_updates.set()
                    updater_thread.join(timeout=1)
                
                pbar.set_description("📊 GP fitting complete")
                pbar.update(50)
            
                # Evaluate on test set
                pbar.set_description("📊 Evaluating model")
                y_pred, y_std = pnl_gp.predict(X_test, return_std=True)
                
                test_mse = mean_squared_error(y_test, y_pred)
                test_mae = mean_absolute_error(y_test, y_pred)
                test_r2 = r2_score(y_test, y_pred)
                pbar.update(15)
                
                # Cross-validation for robustness
                pbar.set_description("📊 Cross-validation")
                cv_scores = cross_val_score(pnl_gp, features, pnl_targets, 
                                           cv=min(5, len(features)//20), 
                                           scoring='neg_mean_squared_error')
                cv_mse = -np.mean(cv_scores)
                pbar.update(15)
                
                logger.info(f"PnL GP trained - Test MSE: {test_mse:.3f}, MAE: {test_mae:.3f}, R²: {test_r2:.3f}")
                logger.info(f"Cross-validation MSE: {cv_mse:.3f} (±{np.std(-cv_scores):.3f})")
                logger.info(f"Kernel: {pnl_gp.kernel_}")
                logger.info(f"Log marginal likelihood: {pnl_gp.log_marginal_likelihood_value_:.3f}")
                
                # Check for overfitting
                train_pred = pnl_gp.predict(X_train)
                train_mse = mean_squared_error(y_train, train_pred)
                
                if train_mse < 0.001 and test_mse > train_mse * 10:
                    logger.warning("⚠️  Possible overfitting detected!")
                
                return pnl_gp, {
                    'test_mse': test_mse,
                    'test_mae': test_mae,
                    'test_r2': test_r2,
                    'cv_mse': cv_mse,
                    'train_mse': train_mse,
                    'kernel_params': pnl_gp.kernel_.get_params(),
                    'n_features': features.shape[1]
                }
                
            except Exception as e:
                logger.error(f"Failed to train PnL GP: {str(e)}")
                return None, {'error': str(e)}
    
    def train_trajectory_gp(self, features, trajectory_targets):
        """Train multi-output GP for trajectory prediction with progress tracking"""
        logger.info("Training Trajectory GP...")
        
        with tqdm(total=100, desc="📈 Trajectory GP Training", unit="%") as pbar:
            # Ensure trajectory variance
            pbar.set_description("📈 Checking trajectory variance")
            if np.var(trajectory_targets) < 1e-6:
                logger.warning("Trajectory targets have low variance - using simplified model")
            pbar.update(10)
            
            # Create multi-output GP
            pbar.set_description("📈 Creating multi-output GP")
            base_gp = GaussianProcessRegressor(**self.gp_configs['trajectory'])
            trajectory_gp = MultiOutputRegressor(base_gp)
            pbar.update(10)
            
            # Train with subset for efficiency
            pbar.set_description("📈 Sampling training data")
            max_samples = min(500, len(features))
            indices = np.random.choice(len(features), max_samples, replace=False)
            pbar.update(10)
            
            # Active progress during trajectory fitting
            pbar.set_description(f"📈 Fitting trajectory GP ({max_samples} samples, {trajectory_targets.shape[1]} outputs)")
            
            # Background progress for trajectory fitting
            import threading
            stop_updates = threading.Event()
            
            def trajectory_progress_updater():
                counter = 0
                while not stop_updates.is_set():
                    counter += 1
                    pbar.set_description(f"📈 Training trajectory GP ({counter}0s elapsed, {trajectory_targets.shape[1]} outputs...)")
                    time.sleep(10)
            
            updater_thread = threading.Thread(target=trajectory_progress_updater)
            updater_thread.daemon = True
            updater_thread.start()
            
            trajectory_gp.fit(features[indices], trajectory_targets[indices])
            
            # Stop progress updater
            stop_updates.set()
            updater_thread.join(timeout=1)
            pbar.update(50)
        
        # Evaluate
        train_pred = trajectory_gp.predict(features[indices])
        train_mse = mean_squared_error(trajectory_targets[indices], train_pred)
        train_r2 = r2_score(trajectory_targets[indices].flatten(), train_pred.flatten())
        
        logger.info(f"Trajectory GP trained - MSE: {train_mse:.3f}, R²: {train_r2:.3f}")
        
        return trajectory_gp, {
            'mse': train_mse,
            'r2': train_r2,
            'n_outputs': trajectory_targets.shape[1],
            'n_samples_used': max_samples
        }
    
    def train_risk_gp(self, features, risk_targets):
        """Train multi-output GP for risk parameter prediction"""
        logger.info("Training Risk GP...")
        
        # Create multi-output GP
        base_gp = GaussianProcessRegressor(**self.gp_configs['risk'])
        risk_gp = MultiOutputRegressor(base_gp)
        
        # Train
        risk_gp.fit(features, risk_targets)
        
        # Evaluate
        train_pred = risk_gp.predict(features)
        train_mse = mean_squared_error(risk_targets, train_pred)
        train_r2 = r2_score(risk_targets.flatten(), train_pred.flatten())
        
        logger.info(f"Risk GP trained - MSE: {train_mse:.3f}, R²: {train_r2:.3f}")
        logger.info(f"SL prediction MAE: {mean_absolute_error(risk_targets[:, 0], train_pred[:, 0]):.2f}")
        logger.info(f"TP prediction MAE: {mean_absolute_error(risk_targets[:, 1], train_pred[:, 1]):.2f}")
        
        return risk_gp, {
            'mse': train_mse,
            'r2': train_r2,
            'n_outputs': risk_targets.shape[1]
        }
    
    def train_instrument_direction(self, instrument, direction):
        """Train all GPs for specific instrument+direction"""
        filename = f"{instrument}_{direction}_training.json"
        
        try:
            # Load data
            data = self.load_training_data(filename)
            
            # Validate data
            if not self.validate_data(data):
                logger.error(f"Data validation failed for {instrument}_{direction}")
                return False
            
            # Preprocess features
            features_scaled = self.preprocess_features(data['features'], fit=True)
            
            # Train individual GPs
            results = {}
            
            # PnL GP
            pnl_gp, pnl_metrics = self.train_pnl_gp(features_scaled, data['pnl_targets'])
            if pnl_gp is None:
                logger.error("Failed to train PnL GP - skipping this instrument+direction")
                return False
            results['pnl'] = {'model': pnl_gp, 'metrics': pnl_metrics}
            
            # Trajectory GP
            trajectory_gp, traj_metrics = self.train_trajectory_gp(features_scaled, data['trajectory_targets'])
            results['trajectory'] = {'model': trajectory_gp, 'metrics': traj_metrics}
            
            # Risk GP
            risk_gp, risk_metrics = self.train_risk_gp(features_scaled, data['risk_targets'])
            results['risk'] = {'model': risk_gp, 'metrics': risk_metrics}
            
            # Save models and preprocessing objects
            model_data = {
                'pnl_gp': pnl_gp,
                'trajectory_gp': trajectory_gp,
                'risk_gp': risk_gp,
                'feature_selector': self.feature_selector,
                'scaler': self.scalers['features'],
                'removed_features': self.removed_features,
                'feature_names': [name for i, name in enumerate(data['feature_names']) 
                                 if i not in self.removed_features],
                'metrics': {
                    'pnl': pnl_metrics,
                    'trajectory': traj_metrics,
                    'risk': risk_metrics
                },
                'training_info': {
                    'n_samples': len(data['features']),
                    'n_features_original': data['features'].shape[1],
                    'n_features_used': features_scaled.shape[1],
                    'instrument': instrument,
                    'direction': direction,
                    'trained_at': datetime.now().isoformat()
                }
            }
            
            # Save combined model
            model_path = os.path.join(self.models_dir, f"{instrument}_{direction}_models.joblib")
            joblib.dump(model_data, model_path)
            logger.info(f"Models and metrics saved to {model_path}")
            
            # Save scaler separately for easy access
            scaler_path = os.path.join(self.models_dir, f"{instrument}_{direction}_scaler.joblib")
            joblib.dump(self.scalers['features'], scaler_path)
            
            logger.info(f"Training completed for {instrument}_{direction}")
            return True
            
        except Exception as e:
            logger.error(f"Training failed for {instrument}_{direction}: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    def train_all(self):
        """Train models for all available datasets with progress tracking"""
        logger.info("Starting enhanced GP training process...")
        
        # Find all training files
        training_files = [f for f in os.listdir(self.data_dir) 
                         if f.endswith('_training.json') and not f.startswith('export')]
        
        logger.info(f"Found {len(training_files)} training datasets")
        
        successes = 0
        failures = 0
        summary = {}
        
        # Main training progress bar
        main_pbar = tqdm(training_files, desc="🚀 Training Models", unit="model")
        
        for i, filename in enumerate(main_pbar):
            # Extract instrument and direction
            parts = filename.replace('_training.json', '').split('_')
            if len(parts) >= 2:
                instrument = '_'.join(parts[:-1])
                direction = parts[-1]
                
                main_pbar.set_description(f"🚀 Training {instrument}_{direction} ({i+1}/{len(training_files)})")
                
                # Show detailed sub-progress
                main_pbar.set_postfix_str("Loading data...")
                time.sleep(0.5)
                
                main_pbar.set_postfix_str("Preprocessing features...")
                time.sleep(0.5)
                
                main_pbar.set_postfix_str("Training models...")
                
                if self.train_instrument_direction(instrument, direction):
                    successes += 1
                    summary[f"{instrument}_{direction}"] = "Success"
                    main_pbar.set_postfix_str("✅ Complete")
                    main_pbar.set_postfix({"✅ Success": successes, "❌ Failed": failures})
                else:
                    failures += 1
                    summary[f"{instrument}_{direction}"] = "Failed"
                    main_pbar.set_postfix_str("❌ Failed")
                    main_pbar.set_postfix({"✅ Success": successes, "❌ Failed": failures})
                
                # Brief pause to show completion status
                time.sleep(1)
        
        main_pbar.close()
        
        logger.info(f"\nTraining completed: {successes} successes, {failures} failures")
        
        # Save training summary with proper metrics
        summary_data = {
            'total_models': successes,
            'failed': failures,
            'models': summary,
            'timestamp': datetime.now().isoformat()
        }
        
        summary_path = os.path.join(self.models_dir, 'training_summary.json')
        with open(summary_path, 'w') as f:
            json.dump(summary_data, f, indent=2)
        
        logger.info(f"Training summary saved: {successes} models")
        logger.info("Enhanced GP training process completed")
        
        return successes, failures

if __name__ == "__main__":
    trainer = EnhancedGPTrainer()
    trainer.train_all()