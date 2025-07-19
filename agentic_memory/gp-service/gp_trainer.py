#!/usr/bin/env python3
"""
GP Training Script for Historical Data
Trains single-output and multi-output GPs from exported LanceDB data
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel, Matern
from sklearn.preprocessing import StandardScaler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GPTrainer:
    def __init__(self, data_dir='./training_data', models_dir='./models'):
        self.data_dir = data_dir
        self.models_dir = models_dir
        
        # Ensure models directory exists
        os.makedirs(self.models_dir, exist_ok=True)
        
        # GP configurations
        self.gp_configs = {
            'pnl': {
                'kernel': RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel(noise_level_bounds=(1e-5, 1e2)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': 10
            },
            'trajectory': {
                'kernel': RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel(noise_level_bounds=(1e-5, 1e2)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': 5
            },
            'risk': {
                'kernel': RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel(noise_level_bounds=(1e-5, 1e2)),
                'normalize_y': True,
                'alpha': 1e-6,
                'n_restarts_optimizer': 5
            }
        }
    
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
        
        return {
            'features': features,
            'pnl_targets': pnl_targets,
            'trajectory_targets': trajectory_targets,
            'risk_targets': risk_targets,
            'feature_names': data['data']['feature_names'],
            'instrument': data['instrument'],
            'direction': data['direction']
        }
    
    def validate_data(self, data):
        """Validate training data quality"""
        features = data['features']
        pnl_targets = data['pnl_targets']
        
        # Check for minimum samples
        if len(features) < 20:
            logger.warning(f"Insufficient samples: {len(features)} < 20")
            return False
        
        # Check for NaN/inf values
        if np.any(np.isnan(features)) or np.any(np.isinf(features)):
            logger.warning("Features contain NaN/inf values")
            return False
        
        if np.any(np.isnan(pnl_targets)) or np.any(np.isinf(pnl_targets)):
            logger.warning("PnL targets contain NaN/inf values")
            return False
        
        # Check feature variance
        feature_vars = np.var(features, axis=0)
        zero_var_features = np.sum(feature_vars < 1e-8)
        if zero_var_features > 0:
            logger.warning(f"{zero_var_features} features have zero variance")
        
        # Check PnL distribution
        pnl_std = np.std(pnl_targets)
        if pnl_std < 1e-3:
            logger.warning(f"PnL targets have very low variance: {pnl_std}")
        
        logger.info(f"Data validation passed: {len(features)} samples")
        return True
    
    def train_pnl_gp(self, features, pnl_targets):
        """Train single-output GP for PnL prediction"""
        logger.info("Training PnL GP...")
        
        # Create and configure GP
        gp = GaussianProcessRegressor(**self.gp_configs['pnl'])
        
        # Train
        gp.fit(features, pnl_targets)
        
        # Evaluate
        train_pred_mean, train_pred_std = gp.predict(features, return_std=True)
        train_mse = mean_squared_error(pnl_targets, train_pred_mean)
        train_r2 = r2_score(pnl_targets, train_pred_mean)
        
        logger.info(f"PnL GP trained - MSE: {train_mse:.3f}, R²: {train_r2:.3f}")
        logger.info(f"Kernel: {gp.kernel_}")
        
        return gp, {
            'mse': train_mse,
            'r2': train_r2,
            'mean_uncertainty': np.mean(train_pred_std),
            'kernel_params': str(gp.kernel_)
        }
    
    def train_trajectory_gp(self, features, trajectory_targets):
        """Train multi-output GP for trajectory prediction"""
        logger.info("Training Trajectory GP...")
        
        # Create multi-output GP
        base_gp = GaussianProcessRegressor(**self.gp_configs['trajectory'])
        trajectory_gp = MultiOutputRegressor(base_gp)
        
        # Train
        trajectory_gp.fit(features, trajectory_targets)
        
        # Evaluate
        train_pred = trajectory_gp.predict(features)
        train_mse = mean_squared_error(trajectory_targets, train_pred)
        train_r2 = r2_score(trajectory_targets.flatten(), train_pred.flatten())
        
        logger.info(f"Trajectory GP trained - MSE: {train_mse:.3f}, R²: {train_r2:.3f}")
        
        return trajectory_gp, {
            'mse': train_mse,
            'r2': train_r2,
            'n_outputs': trajectory_targets.shape[1]
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
            
            # Prepare features
            features = data['features']
            scaler = StandardScaler()
            features_scaled = scaler.fit_transform(features)
            
            # Train models
            models = {}
            metrics = {}
            
            # 1. PnL GP
            models['pnl_gp'], metrics['pnl'] = self.train_pnl_gp(
                features_scaled, data['pnl_targets']
            )
            
            # 2. Trajectory GP
            models['trajectory_gp'], metrics['trajectory'] = self.train_trajectory_gp(
                features_scaled, data['trajectory_targets']
            )
            
            # 3. Risk GP
            models['risk_gp'], metrics['risk'] = self.train_risk_gp(
                features_scaled, data['risk_targets']
            )
            
            # Add metadata
            models.update({
                'scaler': scaler,
                'feature_names': data['feature_names'],
                'trained': True,
                'last_updated': datetime.now(),
                'sample_count': len(features),
                'instrument': instrument,
                'direction': direction
            })
            
            # Save models
            self.save_models(instrument, direction, models, metrics)
            
            logger.info(f"Training completed for {instrument}_{direction}")
            return True
            
        except Exception as e:
            logger.error(f"Training failed for {instrument}_{direction}: {str(e)}")
            return False
    
    def save_models(self, instrument, direction, models, metrics):
        """Save trained models and metrics"""
        key = f"{instrument}_{direction}"
        
        # Save models
        models_path = os.path.join(self.models_dir, f"{key}_models.joblib")
        joblib.dump(models, models_path)
        
        # Save metrics
        metrics_path = os.path.join(self.models_dir, f"{key}_metrics.json")
        
        # Make metrics JSON serializable
        serializable_metrics = {}
        for model_type, model_metrics in metrics.items():
            serializable_metrics[model_type] = {}
            for key, value in model_metrics.items():
                if isinstance(value, (np.floating, np.integer)):
                    serializable_metrics[model_type][key] = float(value)
                else:
                    serializable_metrics[model_type][key] = str(value)
        
        serializable_metrics['timestamp'] = datetime.now().isoformat()
        serializable_metrics['instrument'] = instrument
        serializable_metrics['direction'] = direction
        
        with open(metrics_path, 'w') as f:
            json.dump(serializable_metrics, f, indent=2)
        
        logger.info(f"Models and metrics saved for {instrument}_{direction}")
    
    def train_all_available(self):
        """Train GPs for all available datasets"""
        if not os.path.exists(self.data_dir):
            logger.error(f"Data directory not found: {self.data_dir}")
            return
        
        # Find all training data files
        training_files = [f for f in os.listdir(self.data_dir) if f.endswith('_training.json')]
        
        if not training_files:
            logger.error("No training data files found")
            return
        
        logger.info(f"Found {len(training_files)} training datasets")
        
        successes = 0
        failures = 0
        
        for filename in training_files:
            # Extract instrument and direction from filename
            basename = filename.replace('_training.json', '')
            parts = basename.split('_')
            
            if len(parts) >= 2:
                instrument = parts[0]
                direction = '_'.join(parts[1:])  # Handle multi-word directions
                
                logger.info(f"Training {instrument}_{direction}...")
                
                if self.train_instrument_direction(instrument, direction):
                    successes += 1
                else:
                    failures += 1
            else:
                logger.warning(f"Invalid filename format: {filename}")
                failures += 1
        
        logger.info(f"Training completed: {successes} successes, {failures} failures")
        
        # Generate training summary
        self.generate_training_summary()
    
    def generate_training_summary(self):
        """Generate summary of all trained models"""
        summary = {
            'timestamp': datetime.now().isoformat(),
            'models': []
        }
        
        # Collect metrics from all trained models
        for filename in os.listdir(self.models_dir):
            if filename.endswith('_metrics.json'):
                metrics_path = os.path.join(self.models_dir, filename)
                
                with open(metrics_path, 'r') as f:
                    metrics = json.load(f)
                
                summary['models'].append(metrics)
        
        # Save summary
        summary_path = os.path.join(self.models_dir, 'training_summary.json')
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"Training summary saved: {len(summary['models'])} models")

def main():
    """Main training script"""
    trainer = GPTrainer()
    
    logger.info("Starting GP training process...")
    trainer.train_all_available()
    logger.info("GP training process completed")

if __name__ == '__main__':
    main()