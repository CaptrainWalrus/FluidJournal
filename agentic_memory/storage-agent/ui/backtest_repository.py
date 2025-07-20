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

# Initialize session state for favorites persistence
if 'favorites' not in st.session_state:
    st.session_state.favorites = set()

# Initialize session state for selected heatmap cell
if 'selected_heatmap_cell' not in st.session_state:
    st.session_state.selected_heatmap_cell = None

# Initialize session state for selected session
if 'selected_session' not in st.session_state:
    st.session_state.selected_session = None

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
        
        # Generate entry types and timeframe
        entry_types = ["ORDER_FLOW_IMBALANCE", "EMA_CROSSOVER", "RSI_DIVERGENCE", "VWAP_REVERSION", "BREAKOUT_PATTERN", "MOMENTUM_SWING"]
        entry_type = np.random.choice(entry_types)
        
        # Generate timestamp with realistic year spread
        timestamp = datetime.now() - timedelta(days=np.random.randint(1, 1095))  # Up to 3 years back
        year = timestamp.year
        
        data.append({
            'sessionId': session_id,
            'strategyName': strategy,
            'instrument': instrument,
            'entryType': entry_type,
            'timestamp': timestamp,
            'year': year,
            'isFavorited': session_id in st.session_state.favorites,
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
def get_health_hierarchy():
    """Define health hierarchy for minimum filtering"""
    return {
        "excellent": 4,
        "good": 3, 
        "fair": 2,
        "poor": 1
    }

def filter_by_minimum_health(df, min_health):
    """Filter dataframe by minimum health level"""
    if min_health == "All":
        return df
    
    hierarchy = get_health_hierarchy()
    min_level = hierarchy[min_health]
    
    return df[df['overallHealth'].map(hierarchy) >= min_level]

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

def generate_realistic_equity_curve(session_data):
    """Generate realistic equity curve based on actual session performance"""
    np.random.seed(hash(session_data['sessionId']) % 2**32)
    
    num_trades = session_data['totalTrades']
    starting_capital = 10000
    win_rate = session_data['winRate']
    net_profit = session_data['netProfit']
    max_drawdown = session_data['maxDrawdown']
    
    # More realistic trade distribution
    avg_win = net_profit / (num_trades * win_rate) if win_rate > 0 else 100
    avg_loss = -max_drawdown / (num_trades * (1 - win_rate)) if win_rate < 1 else -50
    
    # Create realistic trade sequence with streaks and volatility
    trades_pnl = []
    consecutive_losses = 0
    
    for i in range(num_trades):
        # Increase loss probability after consecutive losses (realistic psychology)
        adjusted_win_rate = max(0.2, win_rate - (consecutive_losses * 0.05))
        
        if np.random.random() < adjusted_win_rate:
            # Win - vary size significantly
            win_multiplier = np.random.choice([0.5, 1.0, 1.5, 2.0, 3.0], p=[0.3, 0.4, 0.2, 0.08, 0.02])
            trade_pnl = abs(avg_win) * win_multiplier + np.random.normal(0, abs(avg_win) * 0.4)
            consecutive_losses = 0
        else:
            # Loss - occasional large losses
            loss_multiplier = np.random.choice([0.8, 1.0, 1.5, 2.5], p=[0.5, 0.3, 0.15, 0.05])
            trade_pnl = avg_loss * loss_multiplier + np.random.normal(0, abs(avg_loss) * 0.3)
            consecutive_losses += 1
        
        trades_pnl.append(trade_pnl)
    
    # Calculate cumulative equity with more realistic patterns
    cumulative_equity = [starting_capital]
    running_high = starting_capital
    
    for pnl in trades_pnl:
        new_equity = cumulative_equity[-1] + pnl
        cumulative_equity.append(new_equity)
        running_high = max(running_high, new_equity)
    
    # Generate timestamps for trades (spread over time realistically)
    trade_dates = pd.date_range(
        start=session_data['timestamp'] - timedelta(days=30),
        end=session_data['timestamp'],
        periods=len(cumulative_equity)
    )
    
    return pd.DataFrame({
        'Trade': range(len(cumulative_equity)),
        'Date': trade_dates,
        'Equity': cumulative_equity,
        'Drawdown': [max(0, max(cumulative_equity[:i+1]) - eq) for i, eq in enumerate(cumulative_equity)],
        'PnL': [0] + trades_pnl,
        'RunningHigh': [max(cumulative_equity[:i+1]) for i in range(len(cumulative_equity))]
    })

def render_session_footer(df):
    """Render session details as a footer across all tabs"""
    if st.session_state.selected_session is not None:
        session_data = df[df['sessionId'] == st.session_state.selected_session].iloc[0]
        
        st.markdown("---")
        st.markdown("### 📊 Selected Session Details")
        
        # Session header with close button
        header_col1, header_col2 = st.columns([6, 1])
        with header_col1:
            st.markdown(f"**Session:** {session_data['sessionId']} | **Strategy:** {session_data['strategyName']} | **Instrument:** {session_data['instrument']}")
        with header_col2:
            if st.button("✖️ Close", key="close_session"):
                st.session_state.selected_session = None
                st.rerun()
        
        # Tabbed session details
        session_tab1, session_tab2, session_tab3, session_tab4 = st.tabs(["📈 Equity Curve", "⚙️ Parameters", "🎯 Features", "🔧 Actions"])
        
        with session_tab1:
            # Generate realistic equity curve
            equity_df = generate_realistic_equity_curve(session_data)
            
            # Create advanced equity chart
            fig_equity = go.Figure()
            
            # Equity line
            fig_equity.add_trace(go.Scatter(
                x=equity_df['Date'],
                y=equity_df['Equity'],
                mode='lines',
                name='Equity',
                line=dict(color='blue', width=2),
                hovertemplate='<b>Date:</b> %{x}<br><b>Equity:</b> $%{y:,.2f}<br><b>Trade PnL:</b> $%{customdata:,.2f}<extra></extra>',
                customdata=equity_df['PnL']
            ))
            
            # Running high (for drawdown reference)
            fig_equity.add_trace(go.Scatter(
                x=equity_df['Date'],
                y=equity_df['RunningHigh'],
                mode='lines',
                name='Running High',
                line=dict(color='green', width=1, dash='dot'),
                opacity=0.7
            ))
            
            # Underwater curve
            underwater = -(equity_df['Equity'] - equity_df['RunningHigh'])
            fig_equity.add_trace(go.Scatter(
                x=equity_df['Date'],
                y=underwater,
                mode='lines',
                fill='tozeroy',
                name='Drawdown',
                line=dict(color='red', width=0),
                fillcolor='rgba(255,0,0,0.3)',
                yaxis='y2'
            ))
            
            fig_equity.update_layout(
                title=f"Equity Curve - {session_data['sessionId']}",
                xaxis_title="Date",
                yaxis_title="Account Equity ($)",
                yaxis2=dict(
                    title="Drawdown ($)",
                    overlaying="y",
                    side="right",
                    range=[min(underwater) * 1.1, 0]
                ),
                height=350,
                showlegend=True,
                hovermode='x unified'
            )
            
            st.plotly_chart(fig_equity, use_container_width=True)
            
            # Equity metrics
            eq_col1, eq_col2, eq_col3, eq_col4 = st.columns(4)
            with eq_col1:
                st.metric("Net Profit", f"${session_data['netProfit']:,.2f}")
            with eq_col2:
                st.metric("Total Return", f"{((equity_df['Equity'].iloc[-1] - equity_df['Equity'].iloc[0]) / equity_df['Equity'].iloc[0]) * 100:.1f}%")
            with eq_col3:
                st.metric("Max Drawdown", f"${session_data['maxDrawdown']:,.2f}")
            with eq_col4:
                st.metric("Sharpe Ratio", f"{session_data['sharpeRatio']:.2f}")
        
        with session_tab2:
            param_col1, param_col2, param_col3 = st.columns(3)
            with param_col1:
                st.write("**Risk Management:**")
                st.write(f"• Stop Loss: {session_data['stopLoss']} points")
                st.write(f"• Take Profit: {session_data['takeProfit']} points")
                st.write(f"• Win Rate: {session_data['winRate']:.1%}")
            with param_col2:
                st.write("**Technical Indicators:**")
                st.write(f"• Wick Ratio: {session_data['wickRatio']}")
                st.write(f"• Volume Multiplier: {session_data['volumeMultiplier']}")
                st.write(f"• RSI Level: {session_data['rsiLevel']}")
            with param_col3:
                st.write("**Performance:**")
                st.write(f"• Composite Score: {session_data['compositeScore']:.3f}")
                st.write(f"• Profit Factor: {session_data['profitFactor']:.2f}")
                st.write(f"• Total Trades: {session_data['totalTrades']}")
        
        with session_tab3:
            # Feature importance
            feature_data = pd.DataFrame({
                'Feature': ['wickRatio', 'stopLoss', 'rsiLevel', 'volumeMultiplier', 'takeProfit'],
                'Importance': [0.85, 0.72, 0.68, 0.55, 0.45],
                'Value': [session_data['wickRatio'], session_data['stopLoss'], 
                         session_data['rsiLevel'], session_data['volumeMultiplier'], session_data['takeProfit']]
            })
            
            fig_features = px.bar(feature_data, x='Feature', y='Importance', 
                                text='Value',
                                title="Parameter Importance & Values",
                                color='Importance',
                                color_continuous_scale='RdYlGn')
            fig_features.update_traces(texttemplate='%{text}', textposition='outside')
            fig_features.update_layout(height=300)
            st.plotly_chart(fig_features, use_container_width=True)
        
        with session_tab4:
            action_col1, action_col2, action_col3 = st.columns(3)
            with action_col1:
                if st.button("🌟 Toggle Favorite", key="footer_favorite"):
                    session_id = session_data['sessionId']
                    if session_id in st.session_state.favorites:
                        st.session_state.favorites.remove(session_id)
                        st.success("Removed from favorites!")
                    else:
                        st.session_state.favorites.add(session_id)
                        st.success("Added to favorites!")
                    st.rerun()
            with action_col2:
                if st.button("📋 Clone Parameters", key="footer_clone"):
                    st.success("Parameters copied for new backtest!")
            with action_col3:
                if st.button("📊 Similar Sessions", key="footer_similar"):
                    st.info("Would find similar parameter combinations...")

def render_performance_heatmap(df):
    """Render gradient analysis heatmaps for all instruments"""
    st.subheader("📈 Gradient Analysis - All Instruments")
    
    # Metric selection
    color_metric = st.selectbox("Performance Metric", 
                              ["compositeScore", "netProfit", "sharpeRatio", "profitFactor"],
                              key="heatmap_metric")
    
    # Gentle color scheme: brick orange to white to light blue
    custom_colorscale = [
        [0.0, "#D2691E"],    # Brick orange
        [0.5, "#FFFFFF"],    # White
        [1.0, "#ADD8E6"]     # Light blue
    ]
    
    instruments = sorted(df['instrument'].unique())
    
    # Calculate grid layout based on number of instruments
    n_instruments = len(instruments)
    cols_per_row = min(3, n_instruments)  # Max 3 columns
    
    for i in range(0, n_instruments, cols_per_row):
        cols = st.columns(cols_per_row)
        
        for j, instrument in enumerate(instruments[i:i+cols_per_row]):
            with cols[j]:
                create_instrument_heatmap(df, instrument, color_metric, custom_colorscale)

def create_instrument_heatmap(df, instrument, color_metric, custom_colorscale):
    """Create a single heatmap for one instrument"""
    instrument_df = df[df['instrument'] == instrument]
    
    if len(instrument_df) == 0:
        st.warning(f"No data for {instrument}")
        return
    
    # Create grid data for Stop Loss vs Take Profit
    grid_data = []
    sl_values = sorted(instrument_df['stopLoss'].unique())
    tp_values = sorted(instrument_df['takeProfit'].unique())
    
    for sl in sl_values:
        for tp in tp_values:
            subset = instrument_df[
                (instrument_df['stopLoss'] == sl) & 
                (instrument_df['takeProfit'] == tp)
            ]
            if len(subset) > 0:
                avg_performance = subset[color_metric].mean()
                count = len(subset)
                
                grid_data.append({
                    'stopLoss': sl,
                    'takeProfit': tp,
                    'performance': avg_performance,
                    'count': count
                })
    
    if not grid_data:
        st.warning(f"No combinations for {instrument}")
        return
    
    grid_df = pd.DataFrame(grid_data)
    
    # Create pivot table
    heatmap_data = grid_df.pivot_table(
        index='takeProfit', 
        columns='stopLoss', 
        values='performance', 
        aggfunc='mean'
    )
    
    # Calculate tile size based on data density
    max_tests = grid_df['count'].max()
    min_tests = grid_df['count'].min()
    
    # Create count matrix for tile sizing
    count_data = grid_df.pivot_table(
        index='takeProfit',
        columns='stopLoss', 
        values='count',
        aggfunc='mean'
    )
    
    # Normalize tile sizes (more tests = smaller tiles)
    tile_sizes = 1.0 - (count_data - min_tests) / (max_tests - min_tests) * 0.5
    
    # Create the heatmap
    fig = go.Figure(data=go.Heatmap(
        z=heatmap_data.values,
        x=[f"{x}" for x in heatmap_data.columns],
        y=[f"{y}" for y in heatmap_data.index],
        colorscale=custom_colorscale,
        text=np.round(heatmap_data.values, 3),
        texttemplate="%{text}",
        textfont={"size": 8},
        hovertemplate=f"<b>{instrument}</b><br>" +
                     "<b>SL:</b> %{x}<br>" +
                     "<b>TP:</b> %{y}<br>" +
                     f"<b>{color_metric}:</b> %{{z:.3f}}<extra></extra>",
        showscale=False  # Hide individual color scales
    ))
    
    # Calculate dynamic height based on data size
    base_height = 200
    height = max(base_height, min(400, len(tp_values) * 30))
    
    fig.update_layout(
        title=f"{instrument}",
        title_font_size=14,
        xaxis_title="Stop Loss",
        yaxis_title="Take Profit",
        height=height,
        margin=dict(l=40, r=40, t=60, b=40),
        font=dict(size=10)
    )
    
    # Display heatmap without click handling (not supported in older Streamlit)
    st.plotly_chart(
        fig, 
        use_container_width=True,
        key=f"heatmap_{instrument}"
    )
    
    # Add manual selection below heatmap
    if st.button(f"📊 Select from {instrument}", key=f"select_{instrument}"):
        # Show parameter selection
        with st.expander(f"Select parameters for {instrument}", expanded=True):
            col1, col2 = st.columns(2)
            with col1:
                selected_sl = st.selectbox(
                    "Stop Loss",
                    options=sorted(heatmap_data.columns),
                    key=f"sl_{instrument}"
                )
            with col2:
                selected_tp = st.selectbox(
                    "Take Profit", 
                    options=sorted(heatmap_data.index),
                    key=f"tp_{instrument}"
                )
            
            if st.button(f"Load Session", key=f"load_{instrument}"):
                # Find best session with these parameters
                cell_data = instrument_df[
                    (instrument_df['stopLoss'] == selected_sl) & 
                    (instrument_df['takeProfit'] == selected_tp)
                ]
                
                if len(cell_data) > 0:
                    best_session = cell_data.nlargest(1, color_metric).iloc[0]
                    st.session_state.selected_session = best_session['sessionId']
                    st.rerun()
                else:
                    st.warning("No sessions found with these parameters")
    
    # Show gradient quality metrics
    if len(grid_df) > 4:  # Need sufficient data for gradient analysis
        # Calculate gradient smoothness
        perf_values = heatmap_data.values
        gradient_x = np.gradient(perf_values, axis=1)
        gradient_y = np.gradient(perf_values, axis=0) 
        gradient_magnitude = np.sqrt(gradient_x**2 + gradient_y**2)
        smoothness = 1.0 / (1.0 + np.nanmean(gradient_magnitude))
        
        st.metric(
            f"Gradient Quality",
            f"{smoothness:.2f}",
            help="Higher = smoother gradients, less overfitting"
        )

def render_backtest_table(df):
    """Render interactive backtest results table"""
    st.subheader("📋 Backtest Results")
    
    # Table filters - First row
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        show_favorites = st.checkbox("🌟 Favorites Only")
    with col2:
        health_filter = st.selectbox("Minimum Health Level", 
                                   ["All", "poor", "fair", "good", "excellent"],
                                   help="Shows selected level and above (e.g., 'good' includes 'good' and 'excellent')")
    with col3:
        strategy_filter = st.selectbox("Strategy Filter", 
                                     ["All"] + sorted(df['strategyName'].unique().tolist()))
    with col4:
        instrument_filter = st.selectbox("Instrument Filter", 
                                       ["All"] + sorted(df['instrument'].unique().tolist()))
    
    # Table filters - Second row
    col5, col6, col7, col8 = st.columns(4)
    with col5:
        entry_type_filter = st.selectbox("Entry Type Filter", 
                                        ["All"] + sorted(df['entryType'].unique().tolist()))
    with col6:
        year_filter = st.selectbox("Timeframe End (Year)", 
                                  ["All"] + sorted(df['year'].unique().tolist(), reverse=True))
    with col7:
        # SessionID search/filter
        session_search = st.text_input("SessionID Contains", 
                                      placeholder="Search by SessionID...")
    with col8:
        # Clear filters button
        if st.button("🔄 Clear All Filters"):
            st.rerun()
    
    # Apply filters
    filtered_df = df.copy()
    if show_favorites:
        filtered_df = filtered_df[filtered_df['isFavorited'] == True]
    if health_filter != "All":
        filtered_df = filter_by_minimum_health(filtered_df, health_filter)
    if strategy_filter != "All":
        filtered_df = filtered_df[filtered_df['strategyName'] == strategy_filter]
    if instrument_filter != "All":
        filtered_df = filtered_df[filtered_df['instrument'] == instrument_filter]
    if entry_type_filter != "All":
        filtered_df = filtered_df[filtered_df['entryType'] == entry_type_filter]
    if year_filter != "All":
        filtered_df = filtered_df[filtered_df['year'] == year_filter]
    if session_search:
        filtered_df = filtered_df[filtered_df['sessionId'].str.contains(session_search, case=False, na=False)]
    
    # Show filter status
    active_filters = []
    if show_favorites:
        active_filters.append("⭐ Favorites")
    if health_filter != "All":
        active_filters.append(f"Min Health: {health_filter}+")
    if strategy_filter != "All":
        active_filters.append(f"Strategy: {strategy_filter}")
    if instrument_filter != "All":
        active_filters.append(f"Instrument: {instrument_filter}")
    if entry_type_filter != "All":
        active_filters.append(f"Entry Type: {entry_type_filter}")
    if year_filter != "All":
        active_filters.append(f"Year: {year_filter}")
    if session_search:
        active_filters.append(f"SessionID: '{session_search}'")
    
    if active_filters:
        st.info(f"🔍 **Active Filters:** {' | '.join(active_filters)} | **Showing {len(filtered_df)} of {len(df)} results**")
    else:
        st.info(f"📊 **Showing all {len(df)} results** (no filters applied)")
    
    # Sort favorites first, then by composite score
    filtered_df = filtered_df.sort_values(['isFavorited', 'compositeScore'], ascending=[False, False])
    
    # Display table with custom formatting
    display_df = filtered_df[['sessionId', 'strategyName', 'instrument', 'entryType', 'year',
                             'overallHealth', 'compositeScore', 'netProfit', 'sharpeRatio', 'winRate', 
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
    final_df = display_df[['sessionId', 'strategyName', 'instrument', 'entryType', 'year', 'Health', 
                          'Score', 'Profit', 'sharpeRatio', 'winRate', 'topFeatures', 'Favorite']]
    
    # Display dataframe
    st.dataframe(
        final_df,
        use_container_width=True,
        hide_index=True
    )
    
    # Row click handling via manual selection
    st.subheader("🔍 Load Session Details")
    st.write("💡 **Click any row above to load session details in the footer below**")
    
    # Manual row selection as fallback
    if len(filtered_df) > 0:
        with st.expander("🔽 Manual Session Selection (if clicking rows doesn't work)", expanded=False):
            session_options = {
                f"{row['sessionId'][:8]}... - {row['strategyName']} ({row['instrument']})": row['sessionId'] 
                for _, row in filtered_df.head(15).iterrows()
            }
            
            selected_manual = st.selectbox(
                "Choose session:",
                ["Select manually..."] + list(session_options.keys()),
                key="manual_session_select"
            )
            
            if selected_manual != "Select manually...":
                st.session_state.selected_session = session_options[selected_manual]
                st.rerun()
    
    return filtered_df

def render_performance_analytics(df):
    """Render performance analytics focused on optimal parameter identification"""
    st.subheader("🎯 Optimal Parameter Identification")
    
    # Parameter optimization analysis
    col1, col2 = st.columns(2)
    with col1:
        target_instrument = st.selectbox("Focus Instrument", 
                                       ["All"] + sorted(df['instrument'].unique().tolist()),
                                       key="analytics_instrument")
    with col2:
        optimization_metric = st.selectbox("Optimization Target", 
                                         ["compositeScore", "sharpeRatio", "profitFactor", "netProfit"],
                                         key="analytics_metric")
    
    # Filter data
    analysis_df = df if target_instrument == "All" else df[df['instrument'] == target_instrument]
    
    if len(analysis_df) == 0:
        st.warning("No data available for selected instrument")
        return
    
    # Optimal conditions analysis
    st.subheader("🌟 Optimal Conditions Analysis")
    
    # Create parameter ranges analysis
    param_analysis = {}
    parameters = ['stopLoss', 'takeProfit', 'wickRatio', 'volumeMultiplier', 'rsiLevel']
    
    for param in parameters:
        # Group by parameter value and calculate average performance
        param_perf = analysis_df.groupby(param).agg({
            optimization_metric: ['mean', 'std', 'count'],
            'winRate': 'mean',
            'maxDrawdown': 'mean'
        }).round(3)
        
        param_perf.columns = ['avg_performance', 'std_performance', 'count', 'avg_winrate', 'avg_drawdown']
        param_perf = param_perf[param_perf['count'] >= 3]  # Filter for statistical significance
        param_analysis[param] = param_perf.sort_values('avg_performance', ascending=False)
    
    # Display optimal ranges for each parameter
    opt_col1, opt_col2, opt_col3 = st.columns(3)
    
    with opt_col1:
        st.write("**Risk Management Optima:**")
        if len(param_analysis['stopLoss']) > 0:
            best_sl = param_analysis['stopLoss'].index[0]
            st.metric("Optimal Stop Loss", f"{best_sl} pts", 
                     f"{param_analysis['stopLoss'].iloc[0]['avg_performance']:.3f} avg")
        
        if len(param_analysis['takeProfit']) > 0:
            best_tp = param_analysis['takeProfit'].index[0]
            st.metric("Optimal Take Profit", f"{best_tp} pts", 
                     f"{param_analysis['takeProfit'].iloc[0]['avg_performance']:.3f} avg")
    
    with opt_col2:
        st.write("**Technical Indicator Optima:**")
        if len(param_analysis['wickRatio']) > 0:
            best_wick = param_analysis['wickRatio'].index[0]
            st.metric("Optimal Wick Ratio", f"{best_wick:.2f}", 
                     f"{param_analysis['wickRatio'].iloc[0]['avg_performance']:.3f} avg")
        
        if len(param_analysis['volumeMultiplier']) > 0:
            best_vol = param_analysis['volumeMultiplier'].index[0]
            st.metric("Optimal Volume Mult", f"{best_vol:.1f}x", 
                     f"{param_analysis['volumeMultiplier'].iloc[0]['avg_performance']:.3f} avg")
    
    with opt_col3:
        st.write("**Market Condition Optima:**")
        if len(param_analysis['rsiLevel']) > 0:
            best_rsi = param_analysis['rsiLevel'].index[0]
            st.metric("Optimal RSI Level", f"{best_rsi:.0f}", 
                     f"{param_analysis['rsiLevel'].iloc[0]['avg_performance']:.3f} avg")
        
        # Overall best combination
        best_overall = analysis_df.nlargest(1, optimization_metric).iloc[0]
        st.metric("Best Overall Score", f"{best_overall[optimization_metric]:.3f}", 
                 f"{best_overall['strategyName'][:12]}...")
    
    # Gradient clustering analysis
    st.subheader("🌊 Gradient Clustering Analysis")
    st.write("**Goal**: Find neighboring parameter values with similar performance (smooth gradients = less overfitting)")
    
    # Analyze parameter clustering for gradient smoothness
    clustering_results = []
    
    for param in parameters:
        if len(param_analysis[param]) > 2:
            param_data = param_analysis[param].reset_index()
            param_data = param_data.sort_values(param)
            
            # Calculate gradient smoothness
            values = param_data['avg_performance'].values
            if len(values) > 1:
                gradients = np.diff(values)
                smoothness = 1.0 / (1.0 + np.std(gradients))
                
                # Find clusters of similar performance
                cluster_threshold = np.std(values) * 0.5
                clusters = []
                current_cluster = [0]
                
                for i in range(1, len(values)):
                    if abs(values[i] - values[i-1]) <= cluster_threshold:
                        current_cluster.append(i)
                    else:
                        if len(current_cluster) > 1:
                            clusters.append(current_cluster)
                        current_cluster = [i]
                
                if len(current_cluster) > 1:
                    clusters.append(current_cluster)
                
                clustering_results.append({
                    'Parameter': param,
                    'Smoothness': smoothness,
                    'Clusters': len(clusters),
                    'Best_Range': f"{param_data[param].iloc[0]} - {param_data[param].iloc[min(2, len(param_data)-1)]}",
                    'Performance_Std': np.std(values)
                })
    
    if clustering_results:
        cluster_df = pd.DataFrame(clustering_results).sort_values('Smoothness', ascending=False)
        
        cluster_col1, cluster_col2 = st.columns(2)
        
        with cluster_col1:
            st.write("**Parameter Gradient Quality:**")
            for _, row in cluster_df.iterrows():
                quality = "🟢 Smooth" if row['Smoothness'] > 0.7 else "🟡 Moderate" if row['Smoothness'] > 0.4 else "🔴 Rough"
                st.write(f"• **{row['Parameter']}**: {quality} ({row['Smoothness']:.2f})")
        
        with cluster_col2:
            st.write("**Recommended Ranges (Low Overfitting):**")
            for _, row in cluster_df.head(3).iterrows():
                st.write(f"• **{row['Parameter']}**: {row['Best_Range']}")
                st.write(f"  └ {row['Clusters']} smooth clusters found")
    
    # Strategy comparison across instruments
    st.subheader("🏆 Strategy Performance by Instrument")
    
    strategy_instrument_perf = analysis_df.groupby(['strategyName', 'instrument']).agg({
        optimization_metric: 'mean',
        'winRate': 'mean',
        'netProfit': 'mean',
        'maxDrawdown': 'mean',
        'sessionId': 'count'
    }).round(3)
    strategy_instrument_perf.columns = ['avg_score', 'avg_winrate', 'avg_profit', 'avg_drawdown', 'session_count']
    strategy_instrument_perf = strategy_instrument_perf[strategy_instrument_perf['session_count'] >= 2]
    
    # Create strategy-instrument performance matrix
    if len(strategy_instrument_perf) > 0:
        perf_matrix = strategy_instrument_perf.pivot_table(
            index='strategyName', 
            columns='instrument', 
            values='avg_score',
            fill_value=0
        )
        
        fig_matrix = px.imshow(
            perf_matrix,
            title=f"Strategy Performance Matrix ({optimization_metric})",
            color_continuous_scale='RdYlGn',
            text_auto='.3f'
        )
        fig_matrix.update_layout(height=400)
        st.plotly_chart(fig_matrix, use_container_width=True)
        
        # Best combinations table
        st.subheader("🥇 Top Strategy-Instrument Combinations")
        top_combinations = strategy_instrument_perf.nlargest(10, 'avg_score')
        
        display_combinations = top_combinations.reset_index()
        display_combinations['Strategy-Instrument'] = display_combinations['strategyName'] + ' + ' + display_combinations['instrument']
        
        combo_display = display_combinations[['Strategy-Instrument', 'avg_score', 'avg_winrate', 'avg_profit', 'session_count']]
        combo_display.columns = ['Combination', 'Avg Score', 'Win Rate', 'Avg Profit', 'Sessions']
        
        st.dataframe(combo_display, use_container_width=True, hide_index=True)
    
    # Performance distribution analysis
    st.subheader("📈 Performance Distribution Analysis")
    
    dist_col1, dist_col2 = st.columns(2)
    
    with dist_col1:
        # Performance distribution
        fig_dist = px.histogram(analysis_df, x=optimization_metric, nbins=20,
                               title=f"{optimization_metric} Distribution",
                               color_discrete_sequence=['lightblue'])
        fig_dist.add_vline(x=analysis_df[optimization_metric].mean(), 
                          line_dash="dash", line_color="red",
                          annotation_text="Mean")
        fig_dist.add_vline(x=analysis_df[optimization_metric].quantile(0.8), 
                          line_dash="dash", line_color="green",
                          annotation_text="80th Percentile")
        st.plotly_chart(fig_dist, use_container_width=True)
    
    with dist_col2:
        # Risk-Return scatter
        # Create positive size values for scatter plot
        analysis_df_copy = analysis_df.copy()
        min_profit = analysis_df_copy['netProfit'].min()
        analysis_df_copy['size_values'] = analysis_df_copy['netProfit'] - min_profit + 100  # Shift to positive and add offset
        
        fig_scatter = px.scatter(analysis_df_copy, x='maxDrawdown', y=optimization_metric,
                               color='instrument', size='size_values',
                               title="Risk vs Return Analysis",
                               hover_data=['strategyName', 'winRate', 'netProfit'])
        st.plotly_chart(fig_scatter, use_container_width=True)

# Removed old render_session_details function as it's no longer used

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
        render_performance_analytics(df)
    
    # Render session footer if a session is selected
    render_session_footer(df)

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