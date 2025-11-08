import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ItemsScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ItemsScreen = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    tax_rate: '',
    quantity: '',
    cost: '',
    pack_size: '1',
    barcodes: ['']
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE}/items`);
      setItems(response.data);
    } catch (err) {
      setError('Failed to load items');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      tax_rate: '0',
      quantity: '0',
      cost: '0',
      pack_size: '1',
      barcodes: ['']
    });
    setEditingItem(null);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBarcodeChange = (index, value) => {
    const newBarcodes = [...formData.barcodes];
    newBarcodes[index] = value;
    setFormData(prev => ({
      ...prev,
      barcodes: newBarcodes
    }));
  };

  const addBarcodeField = () => {
    setFormData(prev => ({
      ...prev,
      barcodes: [...prev.barcodes, '']
    }));
  };

  const removeBarcodeField = (index) => {
    if (formData.barcodes.length > 1) {
      const newBarcodes = formData.barcodes.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        barcodes: newBarcodes
      }));
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      price: item.price || '',
      tax_rate: item.tax_rate || '0',
      quantity: item.quantity || '0',
      cost: item.cost || '0',
      pack_size: item.pack_size || '1',
      barcodes: item.barcodes && item.barcodes.length > 0 ? item.barcodes : ['']
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate barcodes
    const validBarcodes = formData.barcodes
      .map(b => b.trim())
      .filter(b => b.length > 0);

    if (validBarcodes.length === 0) {
      setError('At least one barcode is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        tax_rate: parseFloat(formData.tax_rate || 0),
        quantity: parseInt(formData.quantity || 0),
        cost: parseFloat(formData.cost || 0),
        pack_size: parseInt(formData.pack_size || 1),
        barcodes: validBarcodes
      };

      if (editingItem) {
        await axios.put(`${API_BASE}/items/${editingItem.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/items`, payload);
      }

      resetForm();
      await fetchItems();
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to save item');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Are you sure you want to deactivate this item? It will be hidden and its barcodes will no longer work.')) {
      return;
    }

    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/items/${itemId}`);
      await fetchItems();
    } catch (err) {
      setError('Failed to deactivate item');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  return (
    <div className="items-screen">
      <div className="items-header">
        <h1>Item Management</h1>
      </div>

      {error && (
        <div className="alert alert-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {/* Item Form */}
      <div className="item-form-section">
        <h2>{editingItem ? 'Edit Item' : 'Create New Item'}</h2>
        <form onSubmit={handleSubmit} className="item-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="price">Price *</label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={handleInputChange}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tax_rate">Tax Rate</label>
              <input
                id="tax_rate"
                name="tax_rate"
                type="number"
                step="0.0001"
                min="0"
                max="1"
                value={formData.tax_rate}
                onChange={handleInputChange}
                placeholder="0.0875"
                disabled={loading}
              />
              <small>e.g., 0.0875 for 8.75%</small>
            </div>

            <div className="form-group">
              <label htmlFor="quantity">Quantity</label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cost">Cost</label>
              <input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pack_size">Pack Size</label>
              <input
                id="pack_size"
                name="pack_size"
                type="number"
                min="1"
                value={formData.pack_size}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Barcodes *</label>
            {formData.barcodes.map((barcode, index) => (
              <div key={index} className="barcode-input-group">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => handleBarcodeChange(index, e.target.value)}
                  placeholder="Enter barcode"
                  disabled={loading}
                  required={index === 0}
                />
                {formData.barcodes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBarcodeField(index)}
                    className="remove-barcode-btn"
                    disabled={loading}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addBarcodeField}
              className="add-barcode-btn"
              disabled={loading}
            >
              + Add Another Barcode
            </button>
            <small>At least one barcode is required</small>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? 'Saving...' : editingItem ? 'Update Item' : 'Create Item'}
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={resetForm}
                className="cancel-btn"
                disabled={loading}
              >
                Cancel
            </button>
          )}
          </div>
        </form>
      </div>

      {/* Inventory Snapshot */}
      <div className="inventory-section">
        <h2>Current Inventory</h2>
        {loading && items.length === 0 ? (
          <div className="loading-state">Loading items...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">No items found. Create your first item above.</div>
        ) : (
          <div className="inventory-table-container">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Tax Rate</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                  <th>Pack Size</th>
                  <th>Barcodes</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={!item.is_active ? 'inactive' : ''}>
                    <td>{item.name}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td>{(parseFloat(item.tax_rate || 0) * 100).toFixed(2)}%</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.cost)}</td>
                    <td>{item.pack_size}</td>
                    <td>
                      <div className="barcodes-cell">
                        {item.barcodes && item.barcodes.length > 0 ? (
                          item.barcodes.map((barcode, idx) => (
                            <span key={idx} className="barcode-tag">
                              {barcode}
                            </span>
                          ))
                        ) : (
                          <span className="no-barcode">No barcodes</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(item)}
                          className="edit-btn"
                          disabled={loading}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="delete-btn"
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemsScreen;

