import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './CashierScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const CashierScreen = () => {
  const [transactionId, setTransactionId] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [change, setChange] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [refundMode, setRefundMode] = useState(false);
  const [refundTransactionId, setRefundTransactionId] = useState('');
  const [refundTransaction, setRefundTransaction] = useState(null);
  const [refundAmount, setRefundAmount] = useState(null);
  const [selectedRefundLines, setSelectedRefundLines] = useState(new Set());
  const barcodeInputRef = useRef(null);

  // Load saved transaction and refund state on mount
  useEffect(() => {
    const loadSavedState = async () => {
      // Load transaction state
      const savedTransactionId = localStorage.getItem('currentTransactionId');
      if (savedTransactionId) {
        try {
          const response = await axios.get(`${API_BASE}/transactions/${savedTransactionId}`);
          // Only restore if transaction is still open
          if (response.data.status === 'open') {
            setTransactionId(savedTransactionId);
            setTransaction(response.data);
          } else {
            // Transaction was finalized, clear it
            localStorage.removeItem('currentTransactionId');
          }
        } catch (err) {
          // Transaction doesn't exist or error, clear it
          localStorage.removeItem('currentTransactionId');
        }
      }

      // Load refund state
      const savedRefundMode = localStorage.getItem('refundMode') === 'true';
      const savedRefundTransactionId = localStorage.getItem('refundTransactionId');
      
      if (savedRefundMode && savedRefundTransactionId) {
        setRefundMode(true);
        setRefundTransactionId(savedRefundTransactionId);
        try {
          const response = await axios.get(`${API_BASE}/transactions/${savedRefundTransactionId}`);
          setRefundTransaction(response.data);
          
          // Initialize selected lines with non-refunded items
          const nonRefundedLines = response.data.lines
            .filter(line => !line.refunded_by)
            .map(line => line.id);
          setSelectedRefundLines(new Set(nonRefundedLines));
          
          // Calculate refund amount
          const amount = response.data.lines
            .filter(line => nonRefundedLines.includes(line.id))
            .reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0);
          setRefundAmount(amount);
        } catch (err) {
          console.error('Failed to load refund transaction:', err);
        }
      }
    };
    loadSavedState();
  }, []);

  // Focus barcode input when transaction is ready
  useEffect(() => {
    if (transactionId && !success) {
      barcodeInputRef.current?.focus();
    }
  }, [transactionId, success]);

  const createNewTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(`${API_BASE}/transactions`);
      const newTransactionId = response.data.id;
      setTransactionId(newTransactionId);
      setTransaction(response.data);
      setSuccess(false);
      setChange(null);
      setCashAmount('');
      // Save transaction ID to localStorage
      localStorage.setItem('currentTransactionId', newTransactionId);
    } catch (err) {
      setError('Failed to create transaction');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransaction = async (id) => {
    try {
      const response = await axios.get(`${API_BASE}/transactions/${id}`);
      setTransaction(response.data);
    } catch (err) {
      console.error('Failed to fetch transaction:', err);
    }
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim() || loading || !transactionId) return;

    try {
      setLoading(true);
      setError(null);

      // Send barcode to backend - it will look up item and add to transaction
      await axios.post(`${API_BASE}/transactions/${transactionId}/lines`, {
        barcode: barcodeInput.trim(),
        quantity: 1
      });

      // Refresh transaction
      await fetchTransaction(transactionId);

      setBarcodeInput('');
      barcodeInputRef.current?.focus();
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Barcode not found');
      } else {
        setError('Failed to add item');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCashSubmit = async (e) => {
    e.preventDefault();
    if (!cashAmount || parseFloat(cashAmount) <= 0 || loading) return;

    const cash = parseFloat(cashAmount);

    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(
        `${API_BASE}/transactions/${transactionId}/finalize`,
        { cashAmount: cash }
      );

      setChange(parseFloat(response.data.change));
      
      // Refresh transaction to get final data with lines
      await fetchTransaction(transactionId);
      
      // Clear saved transaction since it's now finalized
      localStorage.removeItem('currentTransactionId');
      
      setSuccess(true);
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.error || 'Invalid cash amount');
      } else {
        setError('Failed to finalize transaction');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewTransaction = () => {
    createNewTransaction();
  };

  const handleCancelTransaction = async () => {
    if (!transactionId) return;
    
    if (!window.confirm('Are you sure you want to cancel this transaction? All items will be removed.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      await axios.delete(`${API_BASE}/transactions/${transactionId}`);
      
      // Clear transaction state
      setTransactionId(null);
      setTransaction(null);
      setBarcodeInput('');
      setCashAmount('');
      setChange(null);
      setSuccess(false);
      
      // Clear saved transaction from localStorage
      localStorage.removeItem('currentTransactionId');
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.error || 'Cannot cancel this transaction');
      } else {
        setError('Failed to cancel transaction');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefundLookup = async (e) => {
    e.preventDefault();
    if (!refundTransactionId.trim() || loading) return;

    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE}/transactions/${refundTransactionId.trim()}`);
      
      if (response.data.status !== 'finalized') {
        setError('Transaction must be finalized to process a refund');
        return;
      }

      setRefundTransaction(response.data);
      
      // Initialize selected lines with non-refunded items
      const nonRefundedLines = response.data.lines
        .filter(line => !line.refunded_by)
        .map(line => line.id);
      setSelectedRefundLines(new Set(nonRefundedLines));
      
      // Calculate refund amount for all non-refunded items
      const amount = response.data.lines
        .filter(line => nonRefundedLines.includes(line.id))
        .reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0);
      setRefundAmount(amount);

      // Save refund state to localStorage
      localStorage.setItem('refundMode', 'true');
      localStorage.setItem('refundTransactionId', refundTransactionId.trim());
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Transaction not found');
      } else {
        setError('Failed to load transaction');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRefundLine = (lineId) => {
    const newSelected = new Set(selectedRefundLines);
    if (newSelected.has(lineId)) {
      newSelected.delete(lineId);
    } else {
      newSelected.add(lineId);
    }
    setSelectedRefundLines(newSelected);

    // Recalculate refund amount
    const amount = refundTransaction.lines
      .filter(line => newSelected.has(line.id))
      .reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0);
    setRefundAmount(amount);
  };

  const handleSelectAllRefundLines = () => {
    const nonRefundedLines = refundTransaction.lines
      .filter(line => !line.refunded_by)
      .map(line => line.id);
    setSelectedRefundLines(new Set(nonRefundedLines));

    const amount = refundTransaction.lines
      .filter(line => nonRefundedLines.includes(line.id))
      .reduce((sum, line) => sum + parseFloat(line.line_total || 0), 0);
    setRefundAmount(amount);
  };

  const handleDeselectAllRefundLines = () => {
    setSelectedRefundLines(new Set());
    setRefundAmount(0);
  };

  const handleProcessRefund = async () => {
    if (!refundTransaction || selectedRefundLines.size === 0) return;

    if (!window.confirm(`Process refund of ${formatCurrency(refundAmount)}?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const lineIds = Array.from(selectedRefundLines);
      const response = await axios.post(
        `${API_BASE}/transactions/${refundTransactionId}/refund`,
        { lineIds }
      );

      // Refresh refund transaction to see updated state
      const updatedResponse = await axios.get(`${API_BASE}/transactions/${refundTransactionId}`);
      setRefundTransaction(updatedResponse.data);

      setSuccess(true);
      setRefundAmount(response.data.refundAmount);
      
      // Clear refund state from localStorage
      localStorage.removeItem('refundMode');
      localStorage.removeItem('refundTransactionId');
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.error || 'Cannot process refund');
      } else {
        setError('Failed to process refund');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRefund = () => {
    setRefundMode(false);
    setRefundTransactionId('');
    setRefundTransaction(null);
    setRefundAmount(null);
    setSelectedRefundLines(new Set());
    setError(null);
    
    // Clear refund state from localStorage
    localStorage.removeItem('refundMode');
    localStorage.removeItem('refundTransactionId');
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  return (
    <div className="cashier-screen">
      <div className="cashier-header">
        <h1>Cashier</h1>
        {transactionId && !success && (
          <div className="header-actions">
            <div className="transaction-id">
              Transaction: {transactionId.substring(0, 8)}...
            </div>
            <button
              className="cancel-transaction-btn"
              onClick={handleCancelTransaction}
              disabled={loading}
            >
              Cancel Transaction
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {success && transaction && !refundMode && (
        <div className="success-screen">
          <div className="alert alert-success">
            <div className="success-title">Transaction completed successfully!</div>
          </div>
          
          <div className="success-transaction-details">
            <h2>Transaction Summary</h2>
            <div className="receipt-id">
              <span className="receipt-label">Receipt #:</span>
              <span className="receipt-number">{transaction.id}</span>
            </div>
            
            {transaction.lines && transaction.lines.length > 0 && (
              <div className="success-items-list">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.item?.name || 'Unknown Item'}</td>
                        <td>{line.quantity}</td>
                        <td>{formatCurrency(line.unit_price)}</td>
                        <td>{formatCurrency(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="success-totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>{formatCurrency(transaction.subtotal)}</span>
              </div>
              <div className="total-row">
                <span>Tax:</span>
                <span>{formatCurrency(transaction.tax)}</span>
              </div>
              <div className="total-row total">
                <span>Total:</span>
                <span>{formatCurrency(transaction.total)}</span>
              </div>
            </div>

            {change !== null && (
              <div className="change-display">
                Change: <strong>{formatCurrency(change)}</strong>
              </div>
            )}
          </div>

          <button className="new-transaction-btn" onClick={handleNewTransaction}>
            New Transaction
          </button>
        </div>
      )}

      {success && refundMode && refundAmount !== null && (
        <div className="success-screen">
          <div className="alert alert-success">
            <div className="success-title">Refund processed successfully!</div>
          </div>
          
          <div className="success-transaction-details">
            <h2>Refund Summary</h2>
            <div className="refund-amount-display">
              Refund Amount: <strong>{formatCurrency(refundAmount)}</strong>
            </div>
            <p>Give this amount back to the customer.</p>
          </div>

          <button className="new-transaction-btn" onClick={() => {
            setRefundMode(false);
            setRefundTransactionId('');
            setRefundTransaction(null);
            setRefundAmount(null);
            setSelectedRefundLines(new Set());
            setSuccess(false);
            setTransaction(null);
            setChange(null);
            
            // Clear refund state from localStorage
            localStorage.removeItem('refundMode');
            localStorage.removeItem('refundTransactionId');
          }}>
            Home
          </button>
        </div>
      )}

      {!success && !transactionId && !refundMode && (
        <>
          <div className="no-transaction-section">
            <div className="no-transaction-content">
              <h2>No Active Transaction</h2>
              <p>Click the button below to start a new transaction.</p>
              <button 
                className="new-transaction-btn" 
                onClick={handleNewTransaction}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'New Transaction'}
              </button>
            </div>
          </div>

          <div className="refund-section-start">
            <div className="refund-section-label">
              Press button to start a refund
            </div>
            <button 
              className="refund-mode-btn-large" 
              onClick={() => setRefundMode(true)}
              disabled={loading}
            >
              Process Refund
            </button>
          </div>
        </>
      )}

      {!success && refundMode && !refundTransaction && (
        <div className="refund-lookup-section">
          <div className="refund-lookup-content">
            <h2>Process Refund</h2>
            <p>Enter the transaction ID to process a refund.</p>
            <form onSubmit={handleRefundLookup}>
              <div className="input-group">
                <label htmlFor="refund-transaction-id">Transaction ID</label>
                <input
                  id="refund-transaction-id"
                  type="text"
                  value={refundTransactionId}
                  onChange={(e) => setRefundTransactionId(e.target.value)}
                  placeholder="Enter transaction ID..."
                  disabled={loading}
                  autoFocus
                />
                <div className="refund-lookup-actions">
                  <button 
                    type="submit" 
                    disabled={loading || !refundTransactionId.trim()}
                  >
                    {loading ? 'Loading...' : 'Lookup Transaction'}
                  </button>
                  <button 
                    type="button"
                    className="cancel-refund-btn"
                    onClick={handleCancelRefund}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {!success && refundMode && refundTransaction && (
        <div className="refund-details-section">
          <div className="refund-details-header">
            <h2>Refund Transaction</h2>
            <div className="refund-transaction-id">
              Transaction ID: {refundTransaction.id}
            </div>
            <button 
              className="cancel-refund-btn"
              onClick={handleCancelRefund}
              disabled={loading}
            >
              Cancel Refund
            </button>
          </div>

          <div className="refund-items-section">
            <div className="refund-items-header">
              <h3>Select Items to Refund</h3>
              <div className="refund-select-actions">
                <button 
                  type="button"
                  className="select-all-btn"
                  onClick={handleSelectAllRefundLines}
                  disabled={loading}
                >
                  Select All
                </button>
                <button 
                  type="button"
                  className="deselect-all-btn"
                  onClick={handleDeselectAllRefundLines}
                  disabled={loading}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {refundTransaction.lines && refundTransaction.lines.length > 0 ? (
              <div className="refund-items-list">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundTransaction.lines.map((line) => {
                      const isRefunded = line.refunded_by !== null && line.refunded_by !== undefined;
                      const isSelected = selectedRefundLines.has(line.id);
                      return (
                        <tr 
                          key={line.id} 
                          className={isRefunded ? 'refunded-line' : isSelected ? 'selected-line' : ''}
                        >
                          <td>
                            {!isRefunded && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleRefundLine(line.id)}
                                disabled={loading}
                              />
                            )}
                          </td>
                          <td>{line.item?.name || 'Unknown Item'}</td>
                          <td>{line.quantity}</td>
                          <td>{formatCurrency(line.unit_price)}</td>
                          <td>{formatCurrency(line.line_total)}</td>
                          <td>
                            {isRefunded ? (
                              <span className="refunded-badge">Refunded</span>
                            ) : (
                              <span className="available-badge">Available</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <p>No items found in this transaction.</p>
              </div>
            )}

            {refundAmount !== null && refundAmount > 0 && (
              <div className="refund-amount-section">
                <div className="refund-amount-display">
                  <span>Refund Amount:</span>
                  <span className="refund-amount-value">{formatCurrency(refundAmount)}</span>
                </div>
                <button 
                  className="process-refund-btn"
                  onClick={handleProcessRefund}
                  disabled={loading || selectedRefundLines.size === 0}
                >
                  {loading ? 'Processing...' : 'Process Refund'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!success && transactionId && (
        <>
          <div className="barcode-section">
            <form onSubmit={handleBarcodeSubmit}>
              <div className="input-group">
                <label htmlFor="barcode">Scan or Enter Barcode</label>
                <input
                  id="barcode"
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Enter barcode..."
                  disabled={loading}
                  autoFocus
                />
                <button type="submit" disabled={loading || !barcodeInput.trim()}>
                  {loading ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>

          <div className="transaction-section">
            <h2>Transaction Items</h2>
            {transaction?.lines && transaction.lines.length > 0 ? (
              <div className="items-list">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.item?.name || 'Unknown Item'}</td>
                        <td>{line.quantity}</td>
                        <td>{formatCurrency(line.unit_price)}</td>
                        <td>{formatCurrency(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <p>No items added yet. Scan a barcode to get started.</p>
              </div>
            )}

            {transaction && (
              <div className="transaction-totals">
                <div className="total-row">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(transaction.subtotal)}</span>
                </div>
                <div className="total-row">
                  <span>Tax:</span>
                  <span>{formatCurrency(transaction.tax)}</span>
                </div>
                <div className="total-row total">
                  <span>Total:</span>
                  <span>{formatCurrency(transaction.total)}</span>
                </div>
              </div>
            )}

            {transaction && transaction.total > 0 && (
              <div className="cash-section">
                <form onSubmit={handleCashSubmit}>
                  <div className="input-group">
                    <label htmlFor="cash">Cash Amount</label>
                    <input
                      id="cash"
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading || !cashAmount || parseFloat(cashAmount) <= 0}
                    >
                      {loading ? 'Processing...' : 'Complete Sale'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CashierScreen;

