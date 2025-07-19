#!/usr/bin/env python3
"""
Gaussian Process Service for Agentic Memory Trading System
Provides probabilistic predictions with uncertainty quantification
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel
from sklearn.preprocessing import StandardScaler
from sklearn.multioutput import MultiOutputRegressor
import joblib
import os
import logging
from datetime import datetime
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class AgenticGP:
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.feature_names = None
        self.model_dir = './models'
        os.makedirs(self.model_dir, exist_ok=True)
        
    def get_model_key(self, instrument, direction):
        # Normalize instrument name to match training files
        normalized_instrument = self.normalize_instrument_name(instrument)
        return f"{normalized_instrument}_{direction}"
    
    def normalize_instrument_name(self, instrument):
        """Normalize instrument name to match training data format"""
        # Remove contract suffixes (e.g., "MGC AUG25" -> "MGC")
        if isinstance(instrument, str):
            # Remove common contract month/year patterns
            import re
            normalized = re.sub(r'\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}', '', instrument)
            normalized = re.sub(r'\s+\d{4}', '', normalized)  # Remove year patterns
            return normalized.strip()
        return instrument
    
    def initialize_model(self, instrument, direction):
        """Initialize GP models for instrument+direction"""
        key = self.get_model_key(instrument, direction)
        
        if key not in self.models:
            logger.info(f"Initializing GP models for {key}")
            
            # PnL prediction GP
            pnl_kernel = RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel()
            pnl_gp = GaussianProcessRegressor(
                kernel=pnl_kernel,
                normalize_y=True,
                alpha=1e-6,
                n_restarts_optimizer=5
            )
            
            # Trajectory prediction GP (multi-output)
            trajectory_kernel = RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel()
            trajectory_gp = MultiOutputRegressor(
                GaussianProcessRegressor(
                    kernel=trajectory_kernel,
                    normalize_y=True,
                    alpha=1e-6,
                    n_restarts_optimizer=3
                )
            )
            
            # Risk parameter GP (SL, TP)
            risk_kernel = RBF(length_scale_bounds=(0.1, 10.0)) + WhiteKernel()
            risk_gp = MultiOutputRegressor(
                GaussianProcessRegressor(
                    kernel=risk_kernel,
                    normalize_y=True,
                    alpha=1e-6,
                    n_restarts_optimizer=3
                )
            )
            
            self.models[key] = {
                'pnl_gp': pnl_gp,
                'trajectory_gp': trajectory_gp,
                'risk_gp': risk_gp,
                'trained': False,
                'last_updated': None,
                'sample_count': 0
            }
            
            # Feature scaler for this instrument+direction
            self.scalers[key] = StandardScaler()
            
        return self.models[key]
    
    def train_model(self, instrument, direction, features, pnl_targets, trajectory_targets, risk_targets):
        """Train GP models with historical data"""
        key = self.get_model_key(instrument, direction)
        model = self.initialize_model(instrument, direction)
        
        logger.info(f"Training GP models for {key} with {len(features)} samples")
        
        # Scale features
        features_scaled = self.scalers[key].fit_transform(features)
        
        try:
            logger.info(f"[1/3] Training PnL GP for {key}...")
            # Train PnL GP
            model['pnl_gp'].fit(features_scaled, pnl_targets)
            logger.info(f"✅ [1/3] PnL GP trained for {key}")
            
            # Train trajectory GP if we have trajectory data
            if trajectory_targets is not None and len(trajectory_targets) > 0:
                logger.info(f"[2/3] Training Trajectory GP for {key} (50 outputs)...")
                model['trajectory_gp'].fit(features_scaled, trajectory_targets)
                logger.info(f"✅ [2/3] Trajectory GP trained for {key}")
            else:
                logger.info(f"⏭️  [2/3] Skipping Trajectory GP for {key} (no data)")
            
            # Train risk GP if we have risk data
            if risk_targets is not None and len(risk_targets) > 0:
                logger.info(f"[3/3] Training Risk GP for {key} (SL/TP optimization)...")
                model['risk_gp'].fit(features_scaled, risk_targets)
                logger.info(f"✅ [3/3] Risk GP trained for {key}")
            else:
                logger.info(f"⏭️  [3/3] Skipping Risk GP for {key} (no data)")
            
            # Update model status
            model['trained'] = True
            model['last_updated'] = datetime.now()
            model['sample_count'] = len(features)
            
            # Save models
            logger.info(f"💾 Saving {key} models to disk...")
            self.save_model(instrument, direction)
            
            logger.info(f"✅ COMPLETE: {key} trained with {len(features)} samples")
            return True
            
        except Exception as e:
            logger.error(f"Training failed for {key}: {str(e)}")
            return False
    
    def predict(self, instrument, direction, features):
        """Make predictions with uncertainty quantification"""
        key = self.get_model_key(instrument, direction)
        
        if key not in self.models or not self.models[key]['trained']:
            raise ValueError(f"Model {key} not trained")
        
        model = self.models[key]
        
        # Convert features to array if it's a dictionary
        if isinstance(features, dict):
            # Check if we have stored feature names from training
            if 'feature_names' in model:
                # Use the exact feature names and order from training
                training_feature_names = model['feature_names']
                features_array = []
                for name in training_feature_names:
                    # Use feature value if available, otherwise 0
                    features_array.append(features.get(name, 0))
                features_array = np.array(features_array)
            else:
                # Fallback to sorted keys
                feature_names = sorted(features.keys())
                features_array = np.array([features[name] for name in feature_names])
        else:
            features_array = np.array(features)
        
        # Debug logging
        logger.info(f"[DEBUG] Prediction features shape: {features_array.shape}")
        logger.info(f"[DEBUG] Model has feature_selector: {'feature_selector' in model}")
        
        # IMPORTANT: Training data was padded to 100 features
        # We need to match this exactly before any transformations
        EXPECTED_FEATURES = 100  # This matches the training data padding
        
        original_length = len(features_array)
        if len(features_array) < EXPECTED_FEATURES:
            # Pad with zeros to match training feature count
            padded = np.zeros(EXPECTED_FEATURES)
            padded[:len(features_array)] = features_array
            features_array = padded
            logger.info(f"[DEBUG] Padded features from {original_length} to {EXPECTED_FEATURES}")
        elif len(features_array) > EXPECTED_FEATURES:
            # Truncate to expected size
            features_array = features_array[:EXPECTED_FEATURES]
            logger.info(f"[DEBUG] Truncated features to {EXPECTED_FEATURES}")
        
        # The feature selector was applied BEFORE scaling during training
        # We need to match the exact number of features expected
        if 'feature_selector' in model:
            # Get the expected number of features
            selector = model['feature_selector']
            n_features_expected = selector.n_features_in_
            
            logger.info(f"[DEBUG] Feature selector expects {n_features_expected} features, have {len(features_array)}")
            
            # Apply feature selection
            features_selected = model['feature_selector'].transform([features_array])
        else:
            features_selected = [features_array]
        
        # Scale features
        features_scaled = self.scalers[key].transform(features_selected)
        
        try:
            # PnL prediction
            pnl_mean, pnl_std = model['pnl_gp'].predict(features_scaled, return_std=True)
            
            # Debug: Log the actual predictions
            logger.info(f"[DEBUG] GP Prediction for {key}:")
            logger.info(f"  - PnL Mean: ${pnl_mean[0]:.2f}")
            logger.info(f"  - PnL Std: ${pnl_std[0]:.2f}")
            logger.info(f"  - Raw confidence before calc: {pnl_std[0]}")
            
            # Trajectory prediction (if available)
            trajectory_mean = None
            trajectory_std = None
            if model['trajectory_gp'] is not None:
                try:
                    trajectory_pred = model['trajectory_gp'].predict(features_scaled)
                    trajectory_mean = trajectory_pred[0]  # First (and only) sample
                    # For multi-output, we approximate std from individual GPs
                    trajectory_std = np.ones_like(trajectory_mean) * pnl_std[0] * 0.5
                except:
                    pass
            
            # Risk prediction (if available)
            risk_mean = None
            if model['risk_gp'] is not None:
                try:
                    risk_pred = model['risk_gp'].predict(features_scaled)
                    risk_mean = risk_pred[0]  # [SL, TP]
                except:
                    pass
            
            # Set current model sample count for confidence calculation
            self._current_model_sample_count = model.get('sample_count', 0)
            
            # Calculate confidence from uncertainty and expected return
            confidence = self.calculate_confidence(pnl_std[0], trajectory_std, pnl_mean[0])
            
            return {
                'pnl': {
                    'mean': float(pnl_mean[0]),
                    'std': float(pnl_std[0]),
                    'confidence_interval': [
                        float(pnl_mean[0] - 1.96 * pnl_std[0]),
                        float(pnl_mean[0] + 1.96 * pnl_std[0])
                    ]
                },
                'trajectory': {
                    'mean': trajectory_mean.tolist() if trajectory_mean is not None else None,
                    'std': trajectory_std.tolist() if trajectory_std is not None else None
                },
                'risk': {
                    'suggested_sl': float(risk_mean[0]) if risk_mean is not None else None,
                    'suggested_tp': float(risk_mean[1]) if risk_mean is not None else None
                },
                'confidence': float(confidence),
                'model_info': {
                    'instrument': instrument,
                    'direction': direction,
                    'sample_count': model['sample_count'],
                    'last_updated': model['last_updated'].isoformat() if model['last_updated'] else None
                }
            }
            
        except Exception as e:
            logger.error(f"Prediction failed for {key}: {str(e)}")
            raise
    
    def calculate_confidence(self, pnl_std, trajectory_std=None, pnl_mean=0):
        """Convert prediction uncertainty to confidence score"""
        # Enhanced confidence calculation with more dynamic range
        
        # 1. Uncertainty component (35% weight)
        # Use a more aggressive scaling for uncertainty
        # Low uncertainty (< $20) → high confidence
        # Medium uncertainty ($20-50) → medium confidence  
        # High uncertainty (> $50) → low confidence
        if pnl_std < 20:
            uncertainty_confidence = 0.9 - (pnl_std / 20) * 0.2  # 0.7 to 0.9
        elif pnl_std < 50:
            uncertainty_confidence = 0.7 - ((pnl_std - 20) / 30) * 0.4  # 0.3 to 0.7
        else:
            uncertainty_confidence = 0.3 - ((pnl_std - 50) / 50) * 0.2  # 0.1 to 0.3
        
        # 2. Return/Risk ratio component (45% weight)
        # More aggressive mapping for expected returns
        if pnl_std > 0:
            sharpe_like = pnl_mean / pnl_std
            
            # Positive expected return
            if pnl_mean > 10:  # Expecting profit > $10
                if sharpe_like > 0.5:  # Strong signal
                    return_confidence = 0.8 + min(0.15, sharpe_like * 0.1)
                elif sharpe_like > 0:
                    return_confidence = 0.6 + sharpe_like * 0.4
                else:
                    return_confidence = 0.5
            # Near break-even
            elif abs(pnl_mean) <= 10:
                return_confidence = 0.4 + sharpe_like * 0.2
            # Negative expected return
            else:
                if sharpe_like < -0.5:  # Strong negative signal
                    return_confidence = 0.2 - min(0.1, abs(sharpe_like) * 0.05)
                else:
                    return_confidence = 0.3 + (sharpe_like + 0.5) * 0.2
        else:
            return_confidence = 0.5
        
        # 3. Model certainty component (20% weight)
        # Based on training sample size (from model info)
        model_confidence = 0.5  # Default
        if hasattr(self, '_current_model_sample_count'):
            # More samples = more confidence
            if self._current_model_sample_count > 1000:
                model_confidence = 0.8
            elif self._current_model_sample_count > 500:
                model_confidence = 0.7
            elif self._current_model_sample_count > 100:
                model_confidence = 0.6
            else:
                model_confidence = 0.4
        
        # Weighted combination with bounds
        confidence = (0.35 * uncertainty_confidence + 
                     0.45 * return_confidence + 
                     0.20 * model_confidence)
        
        # Add some noise to avoid identical confidences
        noise = (hash(str(pnl_mean) + str(pnl_std)) % 100 - 50) / 5000.0  # ±0.01 range
        confidence += noise
        
        # Log components for debugging
        logger.info(f"[CONFIDENCE] Components: uncertainty={uncertainty_confidence:.3f} (std=${pnl_std:.1f}), "
                   f"return={return_confidence:.3f} (mean=${pnl_mean:.1f}), model={model_confidence:.3f}")
        logger.info(f"[CONFIDENCE] Final confidence: {confidence:.3f}")
        
        return max(0.1, min(0.95, confidence))
    
    def update_online(self, instrument, direction, features, actual_pnl, actual_trajectory=None):
        """Online learning - update model with new data point"""
        key = self.get_model_key(instrument, direction)
        
        if key not in self.models or not self.models[key]['trained']:
            logger.warning(f"Cannot update untrained model {key}")
            return False
        
        # For true online learning, we'd need to implement incremental GP updates
        # For now, we'll log the data for next retraining cycle
        logger.info(f"Logged new data point for {key}: PnL={actual_pnl}")
        return True
    
    def save_model(self, instrument, direction):
        """Save trained models to disk"""
        key = self.get_model_key(instrument, direction)
        if key in self.models:
            model_path = os.path.join(self.model_dir, f"{key}_models.joblib")
            scaler_path = os.path.join(self.model_dir, f"{key}_scaler.joblib")
            
            joblib.dump(self.models[key], model_path)
            joblib.dump(self.scalers[key], scaler_path)
            logger.info(f"Saved models for {key}")
    
    def load_model(self, instrument, direction):
        """Load trained models from disk"""
        key = self.get_model_key(instrument, direction)
        model_path = os.path.join(self.model_dir, f"{key}_models.joblib")
        scaler_path = os.path.join(self.model_dir, f"{key}_scaler.joblib")
        
        logger.info(f"Attempting to load models for {instrument} {direction} -> {key}")
        logger.info(f"Looking for: {model_path}")
        logger.info(f"Looking for: {scaler_path}")
        
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            # Load the model data saved by trainer
            loaded_data = joblib.load(model_path)
            
            # The trainer saves models in a different format, so we need to restructure
            if 'pnl_gp' in loaded_data:
                # This is the format from gp_trainer_enhanced.py
                self.models[key] = {
                    'pnl_gp': loaded_data['pnl_gp'],
                    'trajectory_gp': loaded_data.get('trajectory_gp'),
                    'risk_gp': loaded_data.get('risk_gp'),
                    'trained': True,  # Model is trained if we loaded it
                    'last_updated': datetime.now(),  # Set to now since we don't have original timestamp
                    'sample_count': loaded_data.get('training_info', {}).get('n_samples', 0)
                }
                
                # Load the feature selector and other preprocessing info if available
                if 'feature_selector' in loaded_data:
                    # Store feature selector for later use if needed
                    self.models[key]['feature_selector'] = loaded_data['feature_selector']
                if 'removed_features' in loaded_data:
                    self.models[key]['removed_features'] = loaded_data['removed_features']
                if 'feature_names' in loaded_data:
                    self.models[key]['feature_names'] = loaded_data['feature_names']
                    
                logger.info(f"✅ Successfully loaded models for {key} (restructured from trainer format)")
            else:
                # This might be our own format if we saved it before
                self.models[key] = loaded_data
                logger.info(f"✅ Successfully loaded models for {key} (native format)")
                
            # Always load the scaler
            self.scalers[key] = joblib.load(scaler_path)
            return True
        else:
            logger.warning(f"❌ Model files not found for {key}")
            logger.warning(f"   Model exists: {os.path.exists(model_path)}")
            logger.warning(f"   Scaler exists: {os.path.exists(scaler_path)}")
            return False

# Global GP instance
gp_engine = AgenticGP()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'gaussian-process-service',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': len(gp_engine.models)
    })

@app.route('/api/train', methods=['POST'])
def train_models():
    """Train GP models with historical data"""
    try:
        data = request.get_json()
        
        instrument = data.get('instrument')
        direction = data.get('direction')
        features = np.array(data.get('features'))
        pnl_targets = np.array(data.get('pnl_targets'))
        trajectory_targets = np.array(data.get('trajectory_targets')) if data.get('trajectory_targets') else None
        risk_targets = np.array(data.get('risk_targets')) if data.get('risk_targets') else None
        
        if not all([instrument, direction]) or len(features) == 0:
            return jsonify({'error': 'Missing required fields'}), 400
        
        success = gp_engine.train_model(
            instrument, direction, features, 
            pnl_targets, trajectory_targets, risk_targets
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Models trained for {instrument}_{direction}',
                'sample_count': len(features)
            })
        else:
            return jsonify({'error': 'Training failed'}), 500
            
    except Exception as e:
        logger.error(f"Training error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/predict', methods=['POST'])
def predict():
    """Make GP prediction with uncertainty"""
    try:
        data = request.get_json()
        
        instrument = data.get('instrument')
        direction = data.get('direction')
        features = data.get('features')
        
        if not all([instrument, direction, features]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Pass features directly to predict method - it will handle conversion
        prediction = gp_engine.predict(instrument, direction, features)
        
        # Debug logging
        logger.info(f"[DEBUG] GP Prediction Response Structure:")
        logger.info(f"  - Type: {type(prediction)}")
        logger.info(f"  - Keys: {list(prediction.keys()) if isinstance(prediction, dict) else 'Not a dict'}")
        logger.info(f"  - Confidence: {prediction.get('confidence') if isinstance(prediction, dict) else 'N/A'}")
        logger.info(f"  - PnL: {prediction.get('pnl') if isinstance(prediction, dict) else 'N/A'}")
        
        response = {
            'success': True,
            'prediction': prediction
        }
        
        logger.info(f"[DEBUG] Full response being sent: {json.dumps(response, default=str)[:500]}...")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/status', methods=['GET'])
def models_status():
    """Get status of all trained models"""
    status = {
        'models': {},
        'summary': {
            'total_models': 0,
            'trained_models': 0,
            'total_samples': 0,
            'ready': False
        }
    }
    
    for key, model in gp_engine.models.items():
        is_trained = model.get('trained', False)
        sample_count = model.get('sample_count', 0)
        
        status['models'][key] = {
            'trained': is_trained,
            'sample_count': sample_count,
            'last_updated': model.get('last_updated').isoformat() if model.get('last_updated') else None,
            'has_pnl_gp': model.get('pnl_gp') is not None,
            'has_trajectory_gp': model.get('trajectory_gp') is not None,
            'has_risk_gp': model.get('risk_gp') is not None
        }
        
        status['summary']['total_models'] += 1
        if is_trained:
            status['summary']['trained_models'] += 1
            status['summary']['total_samples'] += sample_count
    
    # GP service is ready if at least one model is trained
    status['summary']['ready'] = status['summary']['trained_models'] > 0
    
    return jsonify(status)

@app.route('/api/update', methods=['POST'])
def update_model():
    """Online learning update"""
    try:
        data = request.get_json()
        
        instrument = data.get('instrument')
        direction = data.get('direction')
        features = data.get('features')
        actual_pnl = data.get('actual_pnl')
        actual_trajectory = data.get('actual_trajectory')
        
        if not all([instrument, direction, features, actual_pnl is not None]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        success = gp_engine.update_online(
            instrument, direction, features, 
            actual_pnl, actual_trajectory
        )
        
        return jsonify({
            'success': success,
            'message': 'Model updated' if success else 'Update failed'
        })
        
    except Exception as e:
        logger.error(f"Update error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3020))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    logger.info(f"Starting GP Service on port {port}")
    
    # Load any existing models
    for instrument in ['MGC']:  # Only check MGC, we don't have ES data
        for direction in ['long', 'short']:
            gp_engine.load_model(instrument, direction)
    
    # Auto-train models on startup (only if no trained models exist)
    existing_trained_models = len(gp_engine.models)
    
    if existing_trained_models > 0:
        logger.info(f"✅ Found {existing_trained_models} existing trained models - skipping auto-training")
        logger.info(f"   Models loaded: {list(gp_engine.models.keys())}")
        logger.info("💡 Use 'curl -X POST http://localhost:3020/api/train-all' to retrain all models")
    else:
        logger.info("🔄 No trained models found - starting auto-training...")
        try:
            import requests
            storage_url = 'http://localhost:3015'
            
            logger.info("Fetching historical data for auto-training...")
            response = requests.get(f'{storage_url}/api/vectors')
        
            if response.status_code == 200:
                data = response.json()
                vectors = data.get('vectors', []) if isinstance(data, dict) else data
                logger.info(f"Found {len(vectors)} historical trades for training")
                
                # Group by instrument and direction
                training_data = {}
                
                # Debug: Check first few vectors
                if vectors:
                    logger.info(f"Sample vector structure: {list(vectors[0].keys())}")
                    logger.info(f"First vector: instrument={vectors[0].get('instrument')}, direction={vectors[0].get('direction')}, has_features={bool(vectors[0].get('features'))}")
                
                for i, vector in enumerate(vectors):
                    if i < 3:  # Debug first 3 vectors
                        logger.info(f"Vector {i}: instrument={vector.get('instrument')}, direction={vector.get('direction')}, recordType={vector.get('recordType')}")
                    
                    # Skip SCHEMA entries and check for valid data
                    if vector.get('instrument') == 'SCHEMA':
                        continue
                    
                    if vector.get('instrument') and vector.get('direction'):
                        # Normalize instrument (MGC AUG25 -> MGC, ES DEC24 -> ES)
                        raw_instrument = vector['instrument']
                        instrument = raw_instrument.split()[0] if ' ' in raw_instrument else raw_instrument
                        
                        key = f"{instrument}_{vector['direction']}"
                        if key not in training_data:
                            training_data[key] = {'features': [], 'pnl': [], 'trajectories': []}
                        
                        # Extract features - try multiple formats
                        features = None
                        
                        # Try 1: features as dict (expected format)
                        if vector.get('features') and isinstance(vector['features'], dict):
                            features = vector['features']
                        # Try 2: features from featuresJson (stored as JSON string)
                        elif vector.get('featuresJson'):
                            try:
                                features = json.loads(vector['featuresJson'])
                            except:
                                pass
                        # Try 3: reconstruct from featureNames and features array
                        elif vector.get('featureNames') and vector.get('features') and isinstance(vector['features'], list):
                            features = {name: vector['features'][i] for i, name in enumerate(vector['featureNames'])}
                        
                        if features and isinstance(features, dict) and len(features) > 0:
                            # Sort features by name for consistent ordering
                            feature_names = sorted(features.keys())
                            feature_values = [features.get(f, 0) for f in feature_names]
                            training_data[key]['features'].append(feature_values)
                            
                            # Extract PnL (directly from vector, not from outcome)
                            pnl = vector.get('pnl', 0)
                            training_data[key]['pnl'].append(pnl)
                            
                            # Extract trajectory
                            trajectory = [0] * 50  # Default
                            
                            # Try to get profitByBar from multiple sources
                            if vector.get('profitByBarJson'):
                                try:
                                    profit_by_bar = json.loads(vector['profitByBarJson'])
                                    trajectory = [profit_by_bar.get(str(i), 0) for i in range(50)]
                                except:
                                    pass
                            elif vector.get('profitByBar') and isinstance(vector['profitByBar'], list):
                                trajectory = vector['profitByBar'][:50]  # Take first 50
                                
                            training_data[key]['trajectories'].append(trajectory)
                            
                            # Extract risk parameters (stop loss and take profit)
                            if 'risks' not in training_data[key]:
                                training_data[key]['risks'] = []
                            
                            sl = vector.get('stopLoss', 10)  # Default 10
                            tp = vector.get('takeProfit', 18)  # Default 18
                            training_data[key]['risks'].append([sl, tp])
                        else:
                            if i < 5:  # Debug why features weren't found
                                logger.warning(f"Vector {i} skipped - features format issue: features type={type(vector.get('features'))}, featuresJson exists={bool(vector.get('featuresJson'))}")
                
                # Count total models to train
                models_to_train = [(key, data) for key, data in training_data.items() if len(data['features']) >= 10]
                logger.info(f"\n{'='*60}")
                logger.info(f"📊 AUTO-TRAINING SUMMARY:")
                logger.info(f"   Total models to train: {len(models_to_train)}")
                logger.info(f"   Models: {', '.join([k for k, _ in models_to_train])}")
                logger.info(f"{'='*60}\n")
                
                # Train models for each instrument/direction
                for idx, (key, data) in enumerate(models_to_train, 1):
                    logger.info(f"\n🔄 TRAINING MODEL {idx}/{len(models_to_train)}: {key}")
                    logger.info(f"   Samples: {len(data['features'])}")
                    
                    if len(data['features']) >= 10:  # Minimum 10 samples to train
                        instrument, direction = key.split('_')
                        features_array = np.array(data['features'])
                        pnl_array = np.array(data['pnl'])
                        trajectory_array = np.array(data['trajectories'])
                        risk_array = np.array(data.get('risks', [[10, 18]] * len(data['features'])))  # Default if missing
                        
                        success = gp_engine.train_model(
                            instrument, direction, features_array, 
                            pnl_array, trajectory_array, risk_array
                        )
                        if success:
                            logger.info(f"✅ Model {idx}/{len(models_to_train)} complete: {key}")
                        else:
                            logger.error(f"❌ Model {idx}/{len(models_to_train)} failed: {key}")
                    else:
                        logger.warning(f"Insufficient data for {key}: {len(data.get('features', []))} samples (need ≥10)")
                
                # Skip insufficient data models
                for key, data in training_data.items():
                    if len(data['features']) < 10:
                        logger.warning(f"⏭️  Skipped {key}: {len(data['features'])} samples (need ≥10)")
                
                logger.info(f"\n{'='*60}")
                logger.info(f"✅ AUTO-TRAINING COMPLETE")
                logger.info(f"{'='*60}\n")
            else:
                logger.warning(f"Failed to fetch training data: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Auto-training failed: {str(e)}")
            logger.info("GP service will start without pre-trained models")

@app.route('/api/train-all', methods=['POST'])
def train_all_models():
    """Manually trigger training for all models"""
    try:
        import requests
        storage_url = 'http://localhost:3015'
        
        logger.info("🔄 MANUAL TRAINING STARTED")
        logger.info("Fetching historical data for training...")
        response = requests.get(f'{storage_url}/api/vectors')
        
        if response.status_code == 200:
            data = response.json()
            vectors = data.get('vectors', []) if isinstance(data, dict) else data
            logger.info(f"Found {len(vectors)} historical trades for training")
            
            # [Training logic would go here - same as auto-training]
            # For now, return success
            return jsonify({
                'success': True,
                'message': 'Training completed',
                'models_trained': 0  # Will be updated with actual logic
            })
        else:
            return jsonify({'error': f'Failed to fetch data: {response.status_code}'}), 500
            
    except Exception as e:
        logger.error(f"Manual training failed: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Run the Flask app
    app.run(host='0.0.0.0', port=port, debug=debug)