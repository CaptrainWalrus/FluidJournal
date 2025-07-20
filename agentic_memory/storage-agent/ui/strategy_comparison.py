import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta
import uuid

# Set page configuration
st.set_page_config(
    page_title="📊 Strategy Comparison",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Mock Data Generator (same as before but simplified)
@st.cache_data
def generate_strategy_data():
    """Generate mock data focused on strategy comparison"""
    
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
    for strategy in strategies:
        for instrument in instruments:
            # Generate 5-15 sessions per strategy-instrument combo
            num_sessions = np.random.randint(5, 16)
            
            for i in range(num_sessions):
                session_id = f"{strategy}_{instrument}_{uuid.uuid4().hex[:8]}"
                
                # Strategy-specific performance characteristics
                if "OrderFlow" in strategy:
                    base_performance = np.random.normal(0.1, 0.8)  # Slightly positive bias
                elif "EMA" in strategy:
                    base_performance = np.random.normal(-0.1, 0.6)  # Slightly negative
                elif "RSI" in strategy:
                    base_performance = np.random.normal(0.2, 0.9)  # More variable
                elif "VWAP" in strategy:
                    base_performance = np.random.normal(0.05, 0.7)
                else:
                    base_performance = np.random.normal(0.0, 0.8)
                
                net_profit = base_performance * 2000 + np.random.normal(0, 500)
                sharpe_ratio = max(0.1, base_performance * 0.5 + 1.2 + np.random.normal(0, 0.3))
                win_rate = max(0.2, min(0.9, 0.55 + base_performance * 0.1 + np.random.normal(0, 0.05)))
                profit_factor = max(0.5, 1.0 + base_performance * 0.3 + np.random.normal(0, 0.2))
                max_drawdown = abs(net_profit * 0.3 + np.random.normal(0, 200))
                
                total_trades = np.random.randint(50, 300)
                
                data.append({
                    'sessionId': session_id,
                    'strategy': strategy,
                    'instrument': instrument,
                    'netProfit': round(net_profit, 2),
                    'sharpeRatio': round(sharpe_ratio, 2),
                    'winRate': round(win_rate, 3),
                    'profitFactor': round(profit_factor, 2),
                    'maxDrawdown': round(max_drawdown, 2),
                    'totalTrades': total_trades,
                    'timestamp': datetime.now() - timedelta(days=np.random.randint(1, 365))
                })
    
    return pd.DataFrame(data)

def generate_realistic_equity_curve(session_data, start_date=None, end_date=None):
    """Generate more realistic equity curve with proper drawdowns"""
    np.random.seed(hash(session_data['sessionId']) % 2**32)
    
    num_trades = session_data['totalTrades']
    starting_capital = 10000
    win_rate = session_data['winRate']
    net_profit = session_data['netProfit']
    max_drawdown = session_data['maxDrawdown']
    
    # Ensure we end up at the right net profit
    target_ending_equity = starting_capital + net_profit
    
    # Calculate more realistic trade distribution
    total_wins = int(num_trades * win_rate)
    total_losses = num_trades - total_wins
    
    # Make losses more impactful to create realistic drawdowns
    if total_losses > 0 and total_wins > 0:
        # We need to solve: (total_wins * avg_win) - (total_losses * avg_loss) = net_profit
        # And: max consecutive losses * avg_loss ≈ max_drawdown
        avg_loss = max_drawdown / max(3, total_losses * 0.3)  # Assume 30% of losses could be consecutive
        avg_win = (net_profit + total_losses * abs(avg_loss)) / total_wins
    else:
        avg_win = 100
        avg_loss = -50
    
    # Generate more realistic trade sequence with streaks
    trades_pnl = []
    consecutive_losses = 0
    consecutive_wins = 0
    
    for i in range(num_trades):
        # Add streak probability
        if consecutive_losses > 2:
            win_probability = min(0.8, win_rate + 0.1)  # Higher chance to break loss streak
        elif consecutive_wins > 3:
            win_probability = max(0.2, win_rate - 0.1)  # Higher chance to break win streak
        else:
            win_probability = win_rate
        
        if np.random.random() < win_probability:
            # Win - but with realistic variation
            multiplier = np.random.choice([0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.5], 
                                        p=[0.1, 0.15, 0.25, 0.3, 0.1, 0.07, 0.03])
            pnl = abs(avg_win) * multiplier
            consecutive_wins += 1
            consecutive_losses = 0
        else:
            # Loss - with occasional large losses
            multiplier = np.random.choice([0.5, 0.8, 1.0, 1.5, 2.0, 3.0], 
                                        p=[0.1, 0.2, 0.4, 0.2, 0.08, 0.02])
            pnl = avg_loss * multiplier
            consecutive_losses += 1
            consecutive_wins = 0
        
        trades_pnl.append(pnl)
    
    # Adjust final trades to hit target
    current_total = sum(trades_pnl)
    adjustment = (net_profit - current_total) / max(5, num_trades * 0.1)
    for i in range(min(5, len(trades_pnl))):
        trades_pnl[-(i+1)] += adjustment
    
    # Calculate cumulative equity with realistic progression
    cumulative_equity = [starting_capital]
    for pnl in trades_pnl:
        new_equity = cumulative_equity[-1] + pnl
        # Prevent going below zero
        if new_equity < starting_capital * 0.5:
            new_equity = starting_capital * 0.5 + abs(pnl) * 0.1
        cumulative_equity.append(new_equity)
    
    # Generate timestamps within the specified timeframe
    if start_date is None:
        start_date = session_data['timestamp'] - timedelta(days=30)
    if end_date is None:
        end_date = session_data['timestamp']
    
    # Create consistent number of data points
    target_points = 100
    
    # If we have different number of trades, resample the equity curve
    if len(cumulative_equity) != target_points:
        # Interpolate to target number of points
        old_indices = np.arange(len(cumulative_equity))
        new_indices = np.linspace(0, len(cumulative_equity)-1, target_points)
        cumulative_equity_resampled = np.interp(new_indices, old_indices, cumulative_equity)
        
        # Resample PnL similarly
        pnl_array = np.array([0] + trades_pnl)
        if len(pnl_array) > 1:
            pnl_resampled = np.interp(new_indices, old_indices, pnl_array)
        else:
            pnl_resampled = np.zeros(target_points)
            
        cumulative_equity = cumulative_equity_resampled
        trades_pnl = pnl_resampled.tolist()[1:]  # Remove the first 0
    
    dates = pd.date_range(start=start_date, end=end_date, periods=target_points)
    
    return pd.DataFrame({
        'Date': dates,
        'Equity': cumulative_equity,
        'Trade': range(len(cumulative_equity)),
        'PnL': [0] + trades_pnl[:target_points-1]  # Ensure correct length
    })

def create_strategy_overview(df):
    """Create strategy performance overview"""
    st.subheader("📊 Strategy Performance Overview")
    
    # Calculate strategy statistics
    strategy_stats = df.groupby('strategy').agg({
        'netProfit': ['mean', 'std', 'count'],
        'sharpeRatio': 'mean',
        'winRate': 'mean',
        'profitFactor': 'mean',
        'maxDrawdown': 'mean'
    }).round(3)
    
    # Flatten column names
    strategy_stats.columns = ['avg_profit', 'profit_std', 'sessions', 'avg_sharpe', 'avg_winrate', 'avg_pf', 'avg_drawdown']
    strategy_stats = strategy_stats.sort_values('avg_profit', ascending=False)
    
    # Display metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Best Strategy", strategy_stats.index[0], f"${strategy_stats.iloc[0]['avg_profit']:,.0f} avg")
    with col2:
        st.metric("Most Consistent", 
                 strategy_stats.nsmallest(1, 'profit_std').index[0],
                 f"±${strategy_stats.nsmallest(1, 'profit_std').iloc[0]['profit_std']:,.0f}")
    with col3:
        st.metric("Highest Sharpe", 
                 strategy_stats.nlargest(1, 'avg_sharpe').index[0],
                 f"{strategy_stats.nlargest(1, 'avg_sharpe').iloc[0]['avg_sharpe']:.2f}")
    with col4:
        st.metric("Total Sessions", f"{df.shape[0]:,}", f"{len(df['strategy'].unique())} strategies")
    
    return strategy_stats

def create_strategy_equity_overlay(df):
    """Create overlaid equity curves for all strategies"""
    st.subheader("📈 Strategy Equity Curves Comparison")
    
    # Strategy selection
    selected_strategies = st.multiselect(
        "Select strategies to compare:",
        options=sorted(df['strategy'].unique()),
        default=sorted(df['strategy'].unique())[:4],  # Show first 4 by default
        key="strategy_selector"
    )
    
    if not selected_strategies:
        st.warning("Please select at least one strategy to display.")
        return
    
    # Instrument filter
    col1, col2, col3 = st.columns(3)
    with col1:
        selected_instrument = st.selectbox(
            "Focus on instrument:",
            options=["All"] + sorted(df['instrument'].unique()),
            key="instrument_selector"
        )
    with col2:
        show_individual = st.checkbox("Show all sessions", value=True)
    with col3:
        normalize_start = st.checkbox("Normalize to same starting point", value=True)
    
    # Filter data
    filtered_df = df[df['strategy'].isin(selected_strategies)]
    if selected_instrument != "All":
        filtered_df = filtered_df[filtered_df['instrument'] == selected_instrument]
    
    if len(filtered_df) == 0:
        st.warning("No data for selected filters.")
        return
    
    # Define common timeframe for all curves
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    # Create the overlay chart
    fig = go.Figure()
    
    colors = px.colors.qualitative.Set1[:len(selected_strategies)]
    
    for i, strategy in enumerate(selected_strategies):
        strategy_data = filtered_df[filtered_df['strategy'] == strategy]
        
        if show_individual:
            # Show ALL individual session curves overlapped in same timeframe
            for j, (_, session) in enumerate(strategy_data.iterrows()):
                equity_curve = generate_realistic_equity_curve(session, start_date, end_date)
                
                # Normalize if requested
                if normalize_start:
                    equity_curve['Equity'] = equity_curve['Equity'] - equity_curve['Equity'].iloc[0] + 10000
                
                fig.add_trace(go.Scatter(
                    x=equity_curve['Date'],
                    y=equity_curve['Equity'],
                    mode='lines',
                    name=f"{strategy} - Session {j+1}",
                    line=dict(color=colors[i], width=1.5),
                    opacity=0.4,
                    showlegend=(j == 0),  # Only show first in legend
                    legendgroup=strategy,
                    hovertemplate=f"<b>{strategy}</b><br>" +
                                 f"Session: {session['sessionId'][:8]}<br>" +
                                 f"Final P/L: ${session['netProfit']:,.0f}<br>" +
                                 "<b>Date:</b> %{x}<br>" +
                                 "<b>Equity:</b> $%{y:,.0f}<extra></extra>"
                ))
        
        # Add average performance line for each strategy
        avg_curve_data = []
        target_length = 100  # Fixed number of points for consistency
        
        for _, session in strategy_data.iterrows():
            equity_curve = generate_realistic_equity_curve(session, start_date, end_date)
            if normalize_start:
                equity_curve['Equity'] = equity_curve['Equity'] - equity_curve['Equity'].iloc[0] + 10000
            
            # Resample to fixed length
            if len(equity_curve) != target_length:
                indices = np.linspace(0, len(equity_curve)-1, target_length, dtype=int)
                resampled_equity = equity_curve['Equity'].iloc[indices].values
            else:
                resampled_equity = equity_curve['Equity'].values
                
            avg_curve_data.append(resampled_equity)
        
        if avg_curve_data:
            avg_equity = np.mean(np.array(avg_curve_data), axis=0)
            dates = pd.date_range(start=start_date, end=end_date, periods=target_length)
            
            fig.add_trace(go.Scatter(
                x=dates,
                y=avg_equity,
                mode='lines',
                name=f"{strategy} - Average",
                line=dict(color=colors[i], width=3, dash='solid'),
                opacity=1.0,
                legendgroup=strategy,
                hovertemplate=f"<b>{strategy} Average</b><br>" +
                             f"Sessions: {len(strategy_data)}<br>" +
                             f"Avg P/L: ${strategy_data['netProfit'].mean():,.0f}<br>" +
                             "<b>Date:</b> %{x}<br>" +
                             "<b>Equity:</b> $%{y:,.0f}<extra></extra>"
            ))
    
    # Add reference line at starting capital
    fig.add_hline(y=10000, line_dash="dash", line_color="gray", 
                  annotation_text="Starting Capital", annotation_position="right")
    
    fig.update_layout(
        title=f"All Sessions Overlapped - {selected_instrument if selected_instrument != 'All' else 'All Instruments'}",
        xaxis_title="Date (Common 30-day window)",
        yaxis_title="Account Equity ($)",
        height=600,
        hovermode='x unified',
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01
        ),
        yaxis=dict(
            rangemode='tozero' if not normalize_start else 'normal'
        )
    )
    
    st.plotly_chart(fig, use_container_width=True)
    
    # Strategy performance table
    st.subheader("📋 Strategy Performance Summary")
    
    summary_stats = filtered_df.groupby('strategy').agg({
        'netProfit': ['mean', 'std', 'min', 'max'],
        'sharpeRatio': 'mean',
        'winRate': 'mean',
        'totalTrades': 'sum'
    }).round(2)
    
    summary_stats.columns = ['Avg Profit', 'Profit Std', 'Min Profit', 'Max Profit', 'Avg Sharpe', 'Win Rate', 'Total Trades']
    summary_stats = summary_stats.sort_values('Avg Profit', ascending=False)
    
    # Add profit factor calculation
    summary_stats['Profit Factor'] = summary_stats['Max Profit'] / abs(summary_stats['Min Profit'])
    summary_stats['Profit Factor'] = summary_stats['Profit Factor'].fillna(0).round(2)
    
    st.dataframe(summary_stats, use_container_width=True)

def main():
    # Page header
    st.title("📊 Strategy Performance Comparison")
    st.markdown("*Compare strategy performance with overlaid equity curves*")
    
    # Load data
    df = generate_strategy_data()
    
    # Sidebar info
    st.sidebar.title("📊 Strategy Analysis")
    st.sidebar.markdown("---")
    
    # Quick stats
    st.sidebar.subheader("📈 Quick Stats")
    st.sidebar.metric("Total Sessions", len(df))
    st.sidebar.metric("Strategies", df['strategy'].nunique())
    st.sidebar.metric("Instruments", df['instrument'].nunique())
    
    best_strategy = df.groupby('strategy')['netProfit'].mean().idxmax()
    best_profit = df.groupby('strategy')['netProfit'].mean().max()
    st.sidebar.success(f"🏆 Best: {best_strategy}")
    st.sidebar.text(f"Avg: ${best_profit:,.0f}")
    
    st.sidebar.markdown("---")
    
    # Data management
    st.sidebar.subheader("🔧 Options")
    if st.sidebar.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()
    
    # Main content
    create_strategy_overview(df)
    st.markdown("---")
    create_strategy_equity_overlay(df)
    
    # Footer
    st.markdown("---")
    st.markdown(
        """
        <div style='text-align: center; color: #666; font-size: 12px;'>
            📊 Strategy Comparison Tool | Clean & Focused Analysis
        </div>
        """, 
        unsafe_allow_html=True
    )

if __name__ == "__main__":
    main()