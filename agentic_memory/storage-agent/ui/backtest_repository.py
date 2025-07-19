import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import json
import uuid
from typing import Dict, List, Any

# Set page configuration
st.set_page_config(
    page_title="🚀 Backtest Repository",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Mock Data Generator
@st.cache_data
def generate_mock_backtest_data():
    """Generate realistic mock backtest data for demonstration"""
    
    strategies = [
        "OrderFlowImbalance_v2.1",
        "OrderFlowImbalance_v2.2",
        "EMA_Crossover_v1.5",
        "RSI_Divergence_v3.0",
        "VWAP_Reversion_v2.8",
        "Breakout_Pattern_v1.3"
    ]
    
    instruments = ["MGC", "ES", "NQ", "GC", "CL"]
    
    data = []
    for i in range(150):  # Generate 150 mock backtests
        strategy = np.random.choice(strategies)
        instrument = np.random.choice(instruments)
        
        # Generate correlated performance metrics
        base_performance = np.random.normal(0, 1)
        
        net_profit = base_performance * 2000 + np.random.normal(0, 500)
        sharpe_ratio = max(0.1, base_performance * 0.5 + 1.2 + np.random.normal(0, 0.3))
        win_rate = max(0.2, min(0.9, 0.55 + base_performance * 0.1 + np.random.normal(0, 0.05)))
        profit_factor = max(0.5, 1.0 + base_performance * 0.3 + np.random.normal(0, 0.2))
        max_drawdown = abs(net_profit * 0.3 + np.random.normal(0, 200))
        
        # Calculate composite score
        profit_score = min(max((net_profit + 2000) / 4000, 0), 1)
        sharpe_score = min(max((sharpe_ratio - 0.5) / 2.0, 0), 1)
        win_rate_score = win_rate
        drawdown_penalty = min(max_drawdown / 3000, 1)
        
        composite_score = (profit_score * 0.3 + sharpe_score * 0.4 + 
                          win_rate_score * 0.2 + (1 - drawdown_penalty) * 0.1)
        composite_score = min(max(composite_score, 0), 1)
        
        # Performance state based on composite score
        if composite_score >= 0.8:
            health = "excellent"
        elif composite_score >= 0.65:
            health = "good"
        elif composite_score >= 0.5:
            health = "fair"
        else:
            health = "poor"
        
        # Generate strategy parameters
        stop_loss = np.random.choice([10, 15, 20, 25, 30])
        take_profit = np.random.choice([15, 20, 25, 30, 40, 50])
        
        session_id = f"{strategy}_{instrument}_{uuid.uuid4().hex[:8]}"
        
        data.append({
            'sessionId': session_id,
            'strategyName': strategy,
            'instrument': instrument,
            'timestamp': datetime.now() - timedelta(days=np.random.randint(1, 90)),
            'isFavorited': np.random.choice([True, False], p=[0.15, 0.85]),
            'overallHealth': health,
            'netProfit': round(net_profit, 2),
            'sharpeRatio': round(sharpe_ratio, 2),
            'winRate': round(win_rate, 3),
            'profitFactor': round(profit_factor, 2),
            'maxDrawdown': round(max_drawdown, 2),
            'compositeScore': round(composite_score, 3),
            'totalTrades': np.random.randint(50, 500),
            'stopLoss': stop_loss,
            'takeProfit': take_profit,
            'wickRatio': round(np.random.uniform(0.1, 0.4), 2),
            'volumeMultiplier': round(np.random.uniform(1.2, 3.0), 1),
            'rsiLevel': np.random.choice([20, 25, 30, 70, 75, 80]),
            'topFeatures': f"wickRatio({np.random.uniform(0.7, 0.9):.2f}), stopLoss({np.random.uniform(0.6, 0.8):.2f}), rsiLevel({np.random.uniform(0.5, 0.7):.2f})"
        })
    
    return pd.DataFrame(data)

# Helper Functions
def get_color_scale(score):
    """Convert composite score to color"""
    if score >= 0.8:
        return "🟢"
    elif score >= 0.65:
        return "🟡"
    elif score >= 0.5:
        return "🟠"
    else:
        return "🔴"

def render_performance_heatmap(df):
    """Render interactive performance heatmap"""
    st.subheader("📈 Performance Heatmap")
    
    # Heatmap controls
    col1, col2, col3 = st.columns(3)
    with col1:
        x_axis = st.selectbox("X-Axis Parameter", 
                            ["stopLoss", "takeProfit", "wickRatio", "volumeMultiplier", "rsiLevel"])
    with col2:
        y_axis = st.selectbox("Y-Axis Parameter", 
                            ["rsiLevel", "wickRatio", "volumeMultiplier", "stopLoss", "takeProfit"])
    with col3:
        color_metric = st.selectbox("Color Metric", 
                                  ["compositeScore", "netProfit", "sharpeRatio", "profitFactor"])
    
    # Create pivot table for heatmap
    try:
        heatmap_data = df.pivot_table(
            index=y_axis, 
            columns=x_axis, 
            values=color_metric, 
            aggfunc='mean'
        )
        
        # Create heatmap with custom colorscale
        fig = px.imshow(
            heatmap_data,
            color_continuous_scale=[[0, "red"], [0.5, "yellow"], [1, "green"]],
            text_auto='.2f',
            aspect="auto",
            title=f"{color_metric} by {x_axis} vs {y_axis}"
        )
        
        fig.update_layout(height=500)
        event = st.plotly_chart(fig, use_container_width=True, on_select="rerun")
        
        # Handle heatmap selection
        if event and 'selection' in event and event['selection']['points']:
            selected_point = event['selection']['points'][0]
            st.session_state['selected_heatmap_point'] = {
                'x': selected_point['x'],
                'y': selected_point['y'],
                x_axis: selected_point['x'],
                y_axis: selected_point['y']
            }
            st.info(f"🎯 Selected: {x_axis}={selected_point['x']}, {y_axis}={selected_point['y']}")
        
    except Exception as e:
        st.error(f"Could not create heatmap: {str(e)}")
        st.info("This might happen with mock data. Try different parameter combinations.")

def render_backtest_table(df):
    """Render interactive backtest results table"""
    st.subheader("📋 Backtest Results")
    
    # Table filters
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        show_favorites = st.checkbox("🌟 Favorites Only")
    with col2:
        health_filter = st.selectbox("Health Filter", 
                                   ["All", "excellent", "good", "fair", "poor"])
    with col3:
        strategy_filter = st.selectbox("Strategy Filter", 
                                     ["All"] + sorted(df['strategyName'].unique().tolist()))
    with col4:
        instrument_filter = st.selectbox("Instrument Filter", 
                                       ["All"] + sorted(df['instrument'].unique().tolist()))
    
    # Apply filters
    filtered_df = df.copy()
    if show_favorites:
        filtered_df = filtered_df[filtered_df['isFavorited'] == True]
    if health_filter != "All":
        filtered_df = filtered_df[filtered_df['overallHealth'] == health_filter]
    if strategy_filter != "All":
        filtered_df = filtered_df[filtered_df['strategyName'] == strategy_filter]
    if instrument_filter != "All":
        filtered_df = filtered_df[filtered_df['instrument'] == instrument_filter]
    
    # Sort favorites first, then by composite score
    filtered_df = filtered_df.sort_values(['isFavorited', 'compositeScore'], ascending=[False, False])
    
    # Display table with custom formatting
    display_df = filtered_df[['sessionId', 'strategyName', 'instrument', 'overallHealth', 
                             'compositeScore', 'netProfit', 'sharpeRatio', 'winRate', 
                             'profitFactor', 'topFeatures', 'isFavorited']].copy()
    
    # Add visual indicators
    display_df['Health'] = display_df['overallHealth'].apply(lambda x: 
        f"🟢 {x}" if x == "excellent" else 
        f"🟡 {x}" if x == "good" else 
        f"🟠 {x}" if x == "fair" else f"🔴 {x}")
    
    display_df['Score'] = display_df['compositeScore'].apply(lambda x: f"{get_color_scale(x)} {x:.3f}")
    display_df['Profit'] = display_df['netProfit'].apply(lambda x: f"${x:,.0f}")
    display_df['Favorite'] = display_df['isFavorited'].apply(lambda x: "⭐" if x else "☆")
    
    # Select columns for display
    final_df = display_df[['sessionId', 'strategyName', 'instrument', 'Health', 
                          'Score', 'Profit', 'sharpeRatio', 'winRate', 'topFeatures', 'Favorite']]
    
    # Display with click selection
    selected_indices = st.dataframe(
        final_df,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row"
    )
    
    # Handle row selection for drill-down
    if selected_indices and len(selected_indices['selection']['rows']) > 0:
        selected_idx = selected_indices['selection']['rows'][0]
        selected_session = filtered_df.iloc[selected_idx]
        render_session_details(selected_session)
    
    return filtered_df

def render_session_details(session_data):
    """Render detailed view for selected session"""
    st.markdown("---")
    st.subheader(f"📊 Session Details: {session_data['sessionId']}")
    
    # Performance metrics
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Net Profit", f"${session_data['netProfit']:,.2f}")
    with col2:
        st.metric("Sharpe Ratio", f"{session_data['sharpeRatio']:.2f}")
    with col3:
        st.metric("Win Rate", f"{session_data['winRate']:.1%}")
    with col4:
        st.metric("Profit Factor", f"{session_data['profitFactor']:.2f}")
    
    # Strategy parameters
    st.subheader("⚙️ Strategy Parameters")
    param_col1, param_col2, param_col3 = st.columns(3)
    
    with param_col1:
        st.write("**Risk Management:**")
        st.write(f"• Stop Loss: {session_data['stopLoss']} points")
        st.write(f"• Take Profit: {session_data['takeProfit']} points")
    
    with param_col2:
        st.write("**Technical Indicators:**")
        st.write(f"• Wick Ratio: {session_data['wickRatio']}")
        st.write(f"• Volume Multiplier: {session_data['volumeMultiplier']}")
        st.write(f"• RSI Level: {session_data['rsiLevel']}")
    
    with param_col3:
        st.write("**Market Context:**")
        st.write(f"• Instrument: {session_data['instrument']}")
        st.write(f"• Strategy: {session_data['strategyName']}")
        st.write(f"• Total Trades: {session_data['totalTrades']}")
    
    # Feature importance visualization
    st.subheader("🎯 Feature Importance")
    feature_data = {
        'Feature': ['wickRatio', 'stopLoss', 'rsiLevel', 'volumeMultiplier', 'takeProfit'],
        'Importance': [0.85, 0.72, 0.68, 0.55, 0.45]  # Mock importance scores
    }
    feature_df = pd.DataFrame(feature_data)
    
    fig = px.bar(feature_df, x='Feature', y='Importance', 
                title="Parameter Importance Scores",
                color='Importance',
                color_continuous_scale='RdYlGn')
    st.plotly_chart(fig, use_container_width=True)
    
    # Action buttons
    st.subheader("🔧 Actions")
    action_col1, action_col2, action_col3 = st.columns(3)
    
    with action_col1:
        if st.button("🌟 Toggle Favorite"):
            st.success("Favorite status toggled! (Mock action)")
    
    with action_col2:
        if st.button("📋 Clone Parameters"):
            st.success("Parameters copied for new backtest! (Mock action)")
    
    with action_col3:
        if st.button("📊 View All Trades"):
            st.info("Would open detailed trade analysis... (Mock action)")

# Main Application
def main():
    # Sidebar
    st.sidebar.title("🚀 Backtest Repository")
    st.sidebar.markdown("*Connected to Agentic Memory Storage*")
    st.sidebar.markdown("---")
    
    # Load mock data
    df = generate_mock_backtest_data()
    
    # Quick stats
    st.sidebar.subheader("📊 Quick Stats")
    st.sidebar.metric("Total Backtests", len(df))
    st.sidebar.metric("Strategies", df['strategyName'].nunique())
    st.sidebar.metric("Avg Composite Score", f"{df['compositeScore'].mean():.2f}")
    
    # Best performer
    best_performer = df.loc[df['compositeScore'].idxmax()]
    st.sidebar.success(f"🏆 Best: {best_performer['strategyName']}")
    st.sidebar.text(f"Score: {best_performer['compositeScore']:.3f}")
    st.sidebar.text(f"Profit: ${best_performer['netProfit']:,.0f}")
    
    st.sidebar.markdown("---")
    
    # Data management
    st.sidebar.subheader("🔧 Data Management")
    if st.sidebar.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()
    
    if st.sidebar.button("📤 Export CSV"):
        csv = df.to_csv(index=False)
        st.sidebar.download_button(
            label="💾 Download",
            data=csv,
            file_name=f"backtest_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv"
        )
    
    # Main content
    st.title("🚀 Backtest Repository Dashboard")
    st.markdown("*Integrated with Agentic Memory Storage Agent*")
    
    # Navigation tabs
    tab1, tab2, tab3 = st.tabs(["📈 Heatmap Analysis", "📋 Table View", "📊 Performance Analytics"])
    
    with tab1:
        render_performance_heatmap(df)
    
    with tab2:
        render_backtest_table(df)
    
    with tab3:
        st.subheader("📊 Performance Analytics")
        
        # Performance distribution
        col1, col2 = st.columns(2)
        
        with col1:
            fig1 = px.histogram(df, x='compositeScore', nbins=20, 
                               title="Composite Score Distribution",
                               color_discrete_sequence=['lightblue'])
            st.plotly_chart(fig1, use_container_width=True)
        
        with col2:
            fig2 = px.scatter(df, x='sharpeRatio', y='netProfit', 
                             color='compositeScore', size='totalTrades',
                             title="Sharpe vs Profit (sized by trades)",
                             color_continuous_scale='RdYlGn')
            st.plotly_chart(fig2, use_container_width=True)
        
        # Strategy comparison
        strategy_perf = df.groupby('strategyName').agg({
            'compositeScore': 'mean',
            'netProfit': 'mean',
            'sharpeRatio': 'mean',
            'winRate': 'mean'
        }).round(3)
        
        st.subheader("🏆 Strategy Performance Comparison")
        st.dataframe(strategy_perf, use_container_width=True)

    # Footer
    st.markdown("---")
    st.markdown(
        """
        <div style='text-align: center; color: #666; font-size: 12px;'>
            🚀 Backtest Repository v1.0 | Integrated with Agentic Memory Storage Agent<br>
            Built with Streamlit • Mock data for demonstration
        </div>
        """, 
        unsafe_allow_html=True
    )

if __name__ == "__main__":
    main()