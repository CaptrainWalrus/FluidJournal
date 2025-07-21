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

def generate_cumulative_trading_curve(session_data, start_date=None, end_date=None):
    """Generate accurate cumulative trading representation"""
    np.random.seed(hash(session_data['sessionId']) % 2**32)
    
    num_trades = session_data['totalTrades']
    starting_capital = 10000
    win_rate = session_data['winRate']
    net_profit = session_data['netProfit']
    max_drawdown = session_data['maxDrawdown']
    profit_factor = session_data['profitFactor']
    
    # Calculate realistic win/loss distribution based on profit factor
    total_wins = int(num_trades * win_rate)
    total_losses = num_trades - total_wins
    
    if total_wins > 0 and total_losses > 0:
        # Profit Factor = Gross Profit / Gross Loss
        # Net Profit = Gross Profit - Gross Loss
        # Solving: PF = GP/GL and NP = GP - GL
        gross_loss = (net_profit) / (profit_factor - 1) if profit_factor > 1 else max_drawdown
        gross_profit = gross_loss * profit_factor
        
        avg_win = gross_profit / total_wins
        avg_loss = -gross_loss / total_losses
    else:
        avg_win = 150
        avg_loss = -100
    
    # Generate trade sequence with realistic market patterns
    trades_pnl = []
    equity_peaks = []  # Track equity peaks for drawdown calculation
    consecutive_losses = 0
    daily_trading_sessions = []
    
    # Simulate trading over time periods (not every day)
    trading_days = np.random.choice(range(num_trades * 2), num_trades, replace=False)
    trading_days.sort()
    
    for i in range(num_trades):
        # Market regime effects (trending vs choppy periods)
        regime_factor = 1.0
        if i > 10:  # After some trades, check recent performance
            recent_trades = trades_pnl[-10:]
            if len([t for t in recent_trades if t < 0]) > 7:  # Choppy period
                regime_factor = 0.7  # Smaller wins/losses
            elif len([t for t in recent_trades if t > 0]) > 7:  # Trending period
                regime_factor = 1.3  # Larger moves
        
        # Realistic win/loss generation
        if np.random.random() < win_rate:
            # Winning trade
            if consecutive_losses > 3:  # After losing streak, smaller wins initially
                win_size = avg_win * 0.6 * regime_factor
            else:
                # Log-normal distribution for wins (more small wins, fewer large ones)
                win_multiplier = np.random.lognormal(mean=0, sigma=0.6)
                win_size = avg_win * min(win_multiplier, 3.0) * regime_factor
            
            trades_pnl.append(abs(win_size))
            consecutive_losses = 0
        else:
            # Losing trade
            if consecutive_losses < 2:  # Normal loss
                loss_multiplier = np.random.gamma(shape=2, scale=0.5)  # Skewed toward smaller losses
            else:  # After multiple losses, occasional large loss (stop hunt, gap, etc.)
                loss_multiplier = np.random.choice([0.8, 1.2, 2.5], p=[0.7, 0.25, 0.05])
            
            loss_size = avg_loss * loss_multiplier * regime_factor
            trades_pnl.append(loss_size)
            consecutive_losses += 1
    
    # Adjust to hit exact net profit target
    current_total = sum(trades_pnl)
    if abs(current_total - net_profit) > 50:  # If significantly off target
        adjustment_per_trade = (net_profit - current_total) / min(10, num_trades)
        for i in range(min(10, len(trades_pnl))):
            trades_pnl[-(i+1)] += adjustment_per_trade
    
    # Calculate realistic cumulative equity with proper drawdown tracking
    cumulative_equity = [starting_capital]
    running_peak = starting_capital
    max_observed_dd = 0
    
    for pnl in trades_pnl:
        new_equity = cumulative_equity[-1] + pnl
        cumulative_equity.append(new_equity)
        
        # Track running peak and drawdown
        if new_equity > running_peak:
            running_peak = new_equity
        
        current_dd = running_peak - new_equity
        max_observed_dd = max(max_observed_dd, current_dd)
    
    # If max drawdown doesn't match, adjust some losing trades
    if abs(max_observed_dd - max_drawdown) > max_drawdown * 0.3:
        # Find the biggest drawdown period and adjust
        peak_equity = starting_capital
        max_dd_start = 0
        max_dd_size = 0
        
        for i, equity in enumerate(cumulative_equity):
            if equity > peak_equity:
                peak_equity = equity
                max_dd_start = i
            
            current_dd = peak_equity - equity
            if current_dd > max_dd_size:
                max_dd_size = current_dd
        
        # Adjust trades in the drawdown period to match target
        if max_dd_size != max_drawdown and max_dd_start > 0:
            adjustment_needed = max_drawdown - max_dd_size
            # Apply adjustment to trades after the peak
            for i in range(max_dd_start, min(max_dd_start + 5, len(trades_pnl))):
                if trades_pnl[i] < 0:  # Only adjust losing trades
                    trades_pnl[i] += adjustment_needed / 5
    
    # Recalculate cumulative equity after adjustments
    cumulative_equity = [starting_capital]
    for pnl in trades_pnl:
        new_equity = max(starting_capital * 0.1, cumulative_equity[-1] + pnl)  # Prevent account blow-up
        cumulative_equity.append(new_equity)
    
    # Generate realistic timestamps (not every day has trades)
    if start_date is None:
        start_date = session_data['timestamp'] - timedelta(days=60)
    if end_date is None:
        end_date = session_data['timestamp']
    
    # Create trading dates (skip weekends, some days have no trades)
    all_dates = pd.date_range(start=start_date, end=end_date, freq='D')
    business_days = [d for d in all_dates if d.weekday() < 5]  # Remove weekends
    
    # Select random subset of business days for trading
    if len(business_days) >= len(cumulative_equity):
        trading_dates = sorted(np.random.choice(business_days, len(cumulative_equity), replace=False))
    else:
        # If not enough business days, spread trades across available days
        trading_dates = business_days + [business_days[-1]] * (len(cumulative_equity) - len(business_days))
    
    # Ensure consistent length for averaging
    target_points = 100
    if len(cumulative_equity) != target_points:
        old_indices = np.arange(len(cumulative_equity))
        new_indices = np.linspace(0, len(cumulative_equity)-1, target_points)
        cumulative_equity = np.interp(new_indices, old_indices, cumulative_equity)
        
        # Resample dates
        trading_dates = pd.date_range(start=start_date, end=end_date, periods=target_points)
        
        # Resample PnL
        if len(trades_pnl) > 0:
            pnl_with_zero = [0] + trades_pnl
            if len(pnl_with_zero) > 1:
                trades_pnl = np.interp(new_indices, old_indices, pnl_with_zero)[1:]
            else:
                trades_pnl = [0] * (target_points - 1)
    
    return pd.DataFrame({
        'Date': trading_dates,
        'Equity': cumulative_equity,
        'Trade': range(len(cumulative_equity)),
        'PnL': [0] + list(trades_pnl[:target_points-1])
    })

def detect_outliers(df, columns=['netProfit', 'maxDrawdown', 'totalTrades'], method='iqr', factor=2.5):
    """Detect outliers using IQR method across multiple columns"""
    outlier_mask = pd.Series([False] * len(df), index=df.index)
    
    for column in columns:
        if column in df.columns:
            Q1 = df[column].quantile(0.25)
            Q3 = df[column].quantile(0.75)
            IQR = Q3 - Q1
            
            # Define outlier bounds
            lower_bound = Q1 - factor * IQR
            upper_bound = Q3 + factor * IQR
            
            # Mark outliers for this column
            column_outliers = (df[column] < lower_bound) | (df[column] > upper_bound)
            outlier_mask = outlier_mask | column_outliers
    
    return outlier_mask

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
    
    # Instrument filter and outlier controls
    col1, col2, col3, col4 = st.columns(4)
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
    with col4:
        show_outliers = st.checkbox("Include outliers", value=False)
    
    # Filter data
    filtered_df = df[df['strategy'].isin(selected_strategies)]
    if selected_instrument != "All":
        filtered_df = filtered_df[filtered_df['instrument'] == selected_instrument]
    
    # Handle outliers
    if not show_outliers:
        outlier_mask = detect_outliers(filtered_df)
        outliers_count = outlier_mask.sum()
        
        if outliers_count > 0:
            st.info(f"🔍 Detected {outliers_count} outlier sessions (excluded). Enable 'Include outliers' to show them.")
            
            # Show outlier details
            with st.expander("View excluded outliers", expanded=False):
                outlier_sessions = filtered_df[outlier_mask][['sessionId', 'strategy', 'instrument', 'netProfit', 'maxDrawdown', 'totalTrades']]
                outlier_sessions['Reason'] = ''
                
                # Identify why each session is an outlier
                for idx, row in outlier_sessions.iterrows():
                    reasons = []
                    
                    # Check each metric
                    for col in ['netProfit', 'maxDrawdown', 'totalTrades']:
                        if col in filtered_df.columns:
                            Q1 = filtered_df[col].quantile(0.25)
                            Q3 = filtered_df[col].quantile(0.75)
                            IQR = Q3 - Q1
                            lower_bound = Q1 - 2.5 * IQR
                            upper_bound = Q3 + 2.5 * IQR
                            
                            if row[col] < lower_bound:
                                reasons.append(f"{col}: too low ({row[col]:,.0f})")
                            elif row[col] > upper_bound:
                                reasons.append(f"{col}: too high ({row[col]:,.0f})")
                    
                    outlier_sessions.loc[idx, 'Reason'] = '; '.join(reasons)
                
                st.dataframe(outlier_sessions, use_container_width=True, hide_index=True)
        
        # Remove outliers from the dataset
        filtered_df = filtered_df[~outlier_mask]
    
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
                equity_curve = generate_cumulative_trading_curve(session, start_date, end_date)
                
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
            equity_curve = generate_cumulative_trading_curve(session, start_date, end_date)
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
    
    # Equity Curve Consolidation Analysis
    st.subheader("🎯 Curve Consolidation Analysis")
    st.write("**Goal**: Identify equity curves with similar performance patterns (consolidated gradients)")
    
    # Calculate curve distances and consolidation metrics
    analyze_curve_consolidation(filtered_df, start_date, end_date, normalize_start, selected_strategies)

def analyze_curve_consolidation(df, start_date, end_date, normalize_start, strategies):
    """Analyze consolidation between equity curves using multi-axis evaluation"""
    
    # Generate all curves for analysis
    all_curves_data = {}
    target_points = 100
    
    for strategy in strategies:
        strategy_data = df[df['strategy'] == strategy]
        curves = []
        
        for _, session in strategy_data.iterrows():
            equity_curve = generate_cumulative_trading_curve(session, start_date, end_date)
            if normalize_start:
                equity_curve['Equity'] = equity_curve['Equity'] - equity_curve['Equity'].iloc[0] + 10000
            
            curves.append({
                'equity': equity_curve['Equity'].values,
                'session_id': session['sessionId'],
                'final_pnl': session['netProfit'],
                'sharpe': session['sharpeRatio'],
                'win_rate': session['winRate']
            })
        
        all_curves_data[strategy] = curves
    
    # Multi-axis consolidation analysis
    consolidation_results = []
    
    for strategy in strategies:
        curves = all_curves_data[strategy]
        if len(curves) < 2:
            continue
            
        # Calculate pairwise distances between curves
        distances = []
        performance_similarities = []
        
        for i in range(len(curves)):
            for j in range(i+1, len(curves)):
                curve1 = curves[i]['equity']
                curve2 = curves[j]['equity']
                
                # Euclidean distance between equity curves
                curve_distance = np.sqrt(np.mean((curve1 - curve2)**2))
                
                # Performance similarity (normalized)
                pnl_diff = abs(curves[i]['final_pnl'] - curves[j]['final_pnl'])
                sharpe_diff = abs(curves[i]['sharpe'] - curves[j]['sharpe'])
                winrate_diff = abs(curves[i]['win_rate'] - curves[j]['win_rate'])
                
                # Combined performance distance
                perf_distance = np.sqrt(
                    (pnl_diff / 2000)**2 +  # Normalize by typical PnL range
                    (sharpe_diff / 2)**2 +   # Normalize by typical Sharpe range
                    (winrate_diff / 0.5)**2  # Normalize by typical win rate range
                )
                
                distances.append(curve_distance)
                performance_similarities.append(perf_distance)
        
        if distances:
            # Consolidation metrics
            avg_curve_distance = np.mean(distances)
            std_curve_distance = np.std(distances)
            avg_perf_distance = np.mean(performance_similarities)
            
            # Consolidation score: lower distance = higher consolidation
            curve_consolidation = 1.0 / (1.0 + avg_curve_distance / 1000)  # Normalize
            performance_consolidation = 1.0 / (1.0 + avg_perf_distance)
            
            # Combined consolidation score
            overall_consolidation = (curve_consolidation * 0.6 + performance_consolidation * 0.4)
            
            consolidation_results.append({
                'Strategy': strategy,
                'Curve_Consolidation': curve_consolidation,
                'Performance_Consolidation': performance_consolidation,
                'Overall_Consolidation': overall_consolidation,
                'Avg_Curve_Distance': avg_curve_distance,
                'Sessions': len(curves)
            })
    
    if consolidation_results:
        consolidation_df = pd.DataFrame(consolidation_results)
        consolidation_df = consolidation_df.sort_values('Overall_Consolidation', ascending=False)
        
        # Display consolidation analysis
        col1, col2 = st.columns(2)
        
        with col1:
            st.write("**📊 Consolidation Rankings:**")
            for _, row in consolidation_df.iterrows():
                score = row['Overall_Consolidation']
                quality = "🟢 Highly Consolidated" if score > 0.7 else "🟡 Moderately Consolidated" if score > 0.5 else "🔴 Scattered"
                st.write(f"• **{row['Strategy']}**: {quality} ({score:.2f})")
                st.write(f"  └ {row['Sessions']} sessions, avg distance: {row['Avg_Curve_Distance']:.0f}")
        
        with col2:
            # Consolidation vs Performance scatter
            fig_consolidation = go.Figure()
            
            for _, row in consolidation_df.iterrows():
                # Get average performance for this strategy
                strategy_data = df[df['strategy'] == row['Strategy']]
                avg_performance = strategy_data['netProfit'].mean()
                
                fig_consolidation.add_trace(go.Scatter(
                    x=[row['Overall_Consolidation']],
                    y=[avg_performance],
                    mode='markers+text',
                    text=[row['Strategy'][:15] + "..."],
                    textposition="top center",
                    marker=dict(
                        size=row['Sessions'] * 2,  # Size by number of sessions
                        color=row['Overall_Consolidation'],
                        colorscale='RdYlGn',
                        showscale=True,
                        colorbar=dict(title="Consolidation Score")
                    ),
                    name=row['Strategy'],
                    hovertemplate=f"<b>{row['Strategy']}</b><br>" +
                                 f"Consolidation: {row['Overall_Consolidation']:.2f}<br>" +
                                 f"Avg Performance: ${avg_performance:,.0f}<br>" +
                                 f"Sessions: {row['Sessions']}<extra></extra>"
                ))
            
            fig_consolidation.update_layout(
                title="Consolidation vs Performance",
                xaxis_title="Consolidation Score (1.0 = Perfect)",
                yaxis_title="Average Performance ($)",
                height=400,
                showlegend=False
            )
            
            st.plotly_chart(fig_consolidation, use_container_width=True)
        
        # Insights
        st.subheader("💡 Consolidation Insights")
        
        best_consolidated = consolidation_df.iloc[0]
        worst_consolidated = consolidation_df.iloc[-1]
        
        insight_col1, insight_col2 = st.columns(2)
        
        with insight_col1:
            st.success(f"**🎯 Most Consolidated**: {best_consolidated['Strategy']}")
            st.write(f"• Consolidation Score: {best_consolidated['Overall_Consolidation']:.2f}")
            st.write(f"• Sessions cluster tightly around similar performance patterns")
            st.write(f"• Lower parameter sensitivity, more predictable results")
        
        with insight_col2:
            st.warning(f"**⚠️ Most Scattered**: {worst_consolidated['Strategy']}")
            st.write(f"• Consolidation Score: {worst_consolidated['Overall_Consolidation']:.2f}")
            st.write(f"• High variance between sessions")
            st.write(f"• May indicate parameter overfitting or market regime sensitivity")
    
    else:
        st.warning("Not enough data for consolidation analysis")

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