import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ReportsScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ReportsScreen = () => {
  const [transactions, setTransactions] = useState([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTransactions, setExpandedTransactions] = useState(new Set());

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE}/transactions?status=finalized&limit=1000`);
      setTransactions(response.data);
      const dailyTotalResponse = await axios.get(`${API_BASE}/transactions/daily-total`);
      setDailyTotal(dailyTotalResponse.data.dailyTotal);
    } catch (err) {
      setError('Failed to load transactions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTransaction = (transactionId, e) => {
    // Don't toggle if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    
    const newExpanded = new Set(expandedTransactions);
    if (newExpanded.has(transactionId)) {
      newExpanded.delete(transactionId);
    } else {
      newExpanded.add(transactionId);
    }
    setExpandedTransactions(newExpanded);
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="reports-screen">
        <div className="loading-state">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reports-screen">
        <div className="error-state">{error}</div>
        <button className="retry-btn" onClick={fetchTransactions}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="reports-screen">
      <div className="reports-header">
        <h1>Transaction Reports</h1>
      </div>
      <div className="reports-summary">
        <div className="summary-item">
          <span className="summary-label">Daily Total:</span>
          <span className="summary-value">{formatCurrency(dailyTotal)}</span>
        </div>
      </div>
      {transactions.length === 0 ? (
        <div className="empty-state">
          <p>No transactions found.</p>
        </div>
      ) : (
        <div className="transactions-list">
          {transactions.map((transaction) => {
            const isExpanded = expandedTransactions.has(transaction.id);
            return (
              <div key={transaction.id} className="transaction-card">
                <div
                  className="transaction-header"
                  onClick={(e) => toggleTransaction(transaction.id, e)}
                >
                  <div className="transaction-header-left">
                    <div className="transaction-date-row">
                      <div className="transaction-date">
                        {formatDate(transaction.created_at)}
                      </div>
                      {transaction.refundStatus === 'full' && (
                        <span className="refund-status-badge refunded-badge">Refunded</span>
                      )}
                      {transaction.refundStatus === 'partial' && (
                        <span className="refund-status-badge partially-refunded-badge">Partially Refunded</span>
                      )}
                    </div>
                    <div 
                      className="transaction-id"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      ID: {isExpanded ? transaction.id : `${transaction.id.substring(0, 8)}...`}
                    </div>
                  </div>
                  <div className="transaction-header-right">
                    <div className="transaction-total">
                      {formatCurrency(transaction.total)}
                    </div>
                    <div className="transaction-items-count">
                      {transaction.lines?.length || 0} item(s)
                    </div>
                    <button className="expand-btn">
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="transaction-details">
                    <div className="transaction-lines">
                      <table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transaction.lines && transaction.lines.length > 0 ? (
                            <>
                              {transaction.lines.map((line) => {
                                const isRefunded = line.refunded_by !== null && line.refunded_by !== undefined;
                                const isInactive = line.item?.is_active === false;
                                return (
                                  <tr key={line.id} className={isRefunded ? 'refunded-item-row' : ''}>
                                    <td>
                                      {line.item?.name || 'Unknown Item'}
                                      {isRefunded && (
                                        <span className="refunded-indicator"> (Refunded)</span>
                                      )}
                                      {isInactive && (
                                        <span className="inactive-indicator"> (Inactive)</span>
                                      )}
                                    </td>
                                    <td>{line.quantity}</td>
                                    <td>{formatCurrency(line.unit_price)}</td>
                                    <td>{formatCurrency(line.line_total)}</td>
                                  </tr>
                                );
                              })}
                            </>
                          ) : (
                            <tr>
                              <td colSpan="4" className="no-items">
                                No items found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="transaction-breakdown">
                      <div className="breakdown-row">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(transaction.subtotal)}</span>
                      </div>
                      <div className="breakdown-row">
                        <span>Tax:</span>
                        <span>{formatCurrency(transaction.tax)}</span>
                      </div>
                      <div className="breakdown-row breakdown-total">
                        <span>Total:</span>
                        <span>{formatCurrency(transaction.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportsScreen;

