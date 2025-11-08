import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ========== API ROUTES ==========

// Look up barcode to get item_id (only for active items)
app.post('/api/barcode/lookup', async (req, res) => {
  try {
    const { barcode } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    // Get barcode with item info to check if item is active
    const { data: barcodeData, error: barcodeError } = await supabase
      .from('item_barcode')
      .select(`
        item_id,
        item:item_id (
          id,
          is_active
        )
      `)
      .eq('barcode', barcode)
      .single();

    if (barcodeError || !barcodeData) {
      return res.status(404).json({ error: 'Barcode not found' });
    }

    // Check if item is active
    const item = barcodeData.item;
    if (!item || !item.is_active) {
      return res.status(404).json({ error: 'Item is inactive' });
    }

    res.json({ item_id: barcodeData.item_id });
  } catch (error) {
    console.error('Barcode lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all items with their barcodes (only active items)
app.get('/api/items', async (req, res) => {
  try {
    const { data: items, error: itemsError } = await supabase
      .from('item')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
      return res.status(500).json({ error: 'Failed to fetch items' });
    }

    // Get all barcodes for all items
    const itemIds = items.map(item => item.id);
    
    if (itemIds.length === 0) {
      return res.json(items.map(item => ({ ...item, barcodes: [] })));
    }

    const { data: barcodes, error: barcodesError } = await supabase
      .from('item_barcode')
      .select('*')
      .in('item_id', itemIds);

    if (barcodesError) {
      console.error('Error fetching barcodes:', barcodesError);
      return res.status(500).json({ error: 'Failed to fetch barcodes' });
    }

    // Group barcodes by item_id
    const barcodesByItem = {};
    (barcodes || []).forEach(barcode => {
      if (!barcodesByItem[barcode.item_id]) {
        barcodesByItem[barcode.item_id] = [];
      }
      barcodesByItem[barcode.item_id].push(barcode.barcode);
    });

    // Combine items with their barcodes
    const itemsWithBarcodes = items.map(item => ({
      ...item,
      barcodes: barcodesByItem[item.id] || []
    }));

    res.json(itemsWithBarcodes);
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get item details by item_id
app.get('/api/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const { data: item, error: itemError } = await supabase
      .from('item')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get barcodes for this item
    const { data: barcodes, error: barcodesError } = await supabase
      .from('item_barcode')
      .select('barcode')
      .eq('item_id', itemId);

    if (barcodesError) {
      console.error('Error fetching barcodes:', barcodesError);
      return res.status(500).json({ error: 'Failed to fetch barcodes' });
    }

    res.json({
      ...item,
      barcodes: (barcodes || []).map(b => b.barcode)
    });
  } catch (error) {
    console.error('Item fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new item
app.post('/api/items', async (req, res) => {
  try {
    const { name, price, tax_rate, quantity, cost, pack_size, barcodes } = req.body;

    if (!name || !price || barcodes === undefined || barcodes.length === 0) {
      return res.status(400).json({ error: 'Name, price, and at least one barcode are required' });
    }

    // Create item
    const { data: item, error: itemError } = await supabase
      .from('item')
      .insert({
        name: name.trim(),
        price: parseFloat(price),
        tax_rate: parseFloat(tax_rate || 0),
        quantity: parseInt(quantity || 0),
        cost: parseFloat(cost || 0),
        pack_size: parseInt(pack_size || 1),
        is_active: true
      })
      .select()
      .single();

    if (itemError) {
      console.error('Error creating item:', itemError);
      return res.status(500).json({ error: 'Failed to create item' });
    }

    // Create barcodes
    const barcodeInserts = barcodes.map(barcode => ({
      item_id: item.id,
      barcode: barcode.trim()
    }));

    const { data: createdBarcodes, error: barcodesError } = await supabase
      .from('item_barcode')
      .insert(barcodeInserts)
      .select();

    if (barcodesError) {
      console.error('Error creating barcodes:', barcodesError);
      // Rollback: delete the item if barcode creation fails
      await supabase.from('item').delete().eq('id', item.id);
      return res.status(500).json({ error: 'Failed to create barcodes' });
    }

    res.json({
      ...item,
      barcodes: createdBarcodes.map(b => b.barcode)
    });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an item
app.put('/api/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { name, price, tax_rate, quantity, cost, pack_size, barcodes } = req.body;

    // Update item
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) updateData.price = parseFloat(price);
    if (tax_rate !== undefined) updateData.tax_rate = parseFloat(tax_rate);
    if (quantity !== undefined) updateData.quantity = parseInt(quantity);
    if (cost !== undefined) updateData.cost = parseFloat(cost);
    if (pack_size !== undefined) updateData.pack_size = parseInt(pack_size);

    const { data: item, error: itemError } = await supabase
      .from('item')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update barcodes if provided
    if (barcodes !== undefined) {
      if (barcodes.length === 0) {
        return res.status(400).json({ error: 'At least one barcode is required' });
      }

      // Delete existing barcodes
      const { error: deleteError } = await supabase
        .from('item_barcode')
        .delete()
        .eq('item_id', itemId);

      if (deleteError) {
        console.error('Error deleting old barcodes:', deleteError);
        return res.status(500).json({ error: 'Failed to update barcodes' });
      }

      // Insert new barcodes
      const barcodeInserts = barcodes.map(barcode => ({
        item_id: itemId,
        barcode: barcode.trim()
      }));

      const { error: insertError } = await supabase
        .from('item_barcode')
        .insert(barcodeInserts);

      if (insertError) {
        console.error('Error creating new barcodes:', insertError);
        return res.status(500).json({ error: 'Failed to update barcodes' });
      }
    }

    // Fetch updated item with barcodes
    const { data: barcodesData, error: barcodesError } = await supabase
      .from('item_barcode')
      .select('barcode')
      .eq('item_id', itemId);

    if (barcodesError) {
      console.error('Error fetching updated barcodes:', barcodesError);
    }

    res.json({
      ...item,
      barcodes: (barcodesData || []).map(b => b.barcode)
    });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an item (soft delete by setting is_active to false)
app.delete('/api/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const { data, error } = await supabase
      .from('item')
      .update({ is_active: false })
      .eq('id', itemId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully', item: data });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pos_transaction')
      .insert({
        status: 'open',
        subtotal: 0,
        tax: 0,
        total: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Transaction creation error:', error);
      return res.status(500).json({ error: 'Failed to create transaction' });
    }

    res.json(data);
  } catch (error) {
    console.error('Transaction creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to transaction (create transaction_line) by barcode
app.post('/api/transactions/:transactionId/lines', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { barcode, quantity = 1 } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // Look up barcode to get item_id and verify item is active
    const { data: barcodeData, error: barcodeError } = await supabase
      .from('item_barcode')
      .select(`
        item_id,
        item:item_id (
          id,
          is_active
        )
      `)
      .eq('barcode', barcode.trim())
      .single();

    if (barcodeError || !barcodeData) {
      return res.status(404).json({ error: 'Barcode not found' });
    }

    // Check if item is active
    const itemCheck = barcodeData.item;
    if (!itemCheck || !itemCheck.is_active) {
      return res.status(404).json({ error: 'Item is inactive' });
    }

    const item_id = barcodeData.item_id;

    // Get full item details
    const { data: item, error: itemError } = await supabase
      .from('item')
      .select('*')
      .eq('id', item_id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Calculate line total
    const unitPrice = parseFloat(item.price);
    const taxRate = parseFloat(item.tax_rate);
    const subtotal = unitPrice * quantity;
    const tax = subtotal * taxRate;
    const lineTotal = subtotal + tax;

    // Create transaction line
    const { data: line, error: lineError } = await supabase
      .from('transaction_line')
      .insert({
        transaction_id: transactionId,
        item_id: item_id,
        quantity: quantity,
        unit_price: unitPrice,
        tax_rate: taxRate,
        line_total: lineTotal
      })
      .select()
      .single();

    if (lineError) {
      console.error('Transaction line creation error:', lineError);
      return res.status(500).json({ error: 'Failed to add item to transaction' });
    }

    // Update transaction totals
    const { data: transaction, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError) {
      return res.status(500).json({ error: 'Failed to fetch transaction' });
    }

    // Calculate new totals
    const { data: allLines } = await supabase
      .from('transaction_line')
      .select('line_total, tax_rate, unit_price, quantity')
      .eq('transaction_id', transactionId);

    let newSubtotal = 0;
    let newTax = 0;
    let newTotal = 0;

    allLines.forEach((line) => {
      const lineSubtotal = parseFloat(line.unit_price) * parseInt(line.quantity);
      const lineTax = lineSubtotal * parseFloat(line.tax_rate);
      const lineTotal = lineSubtotal + lineTax;
      
      newSubtotal += lineSubtotal;
      newTax += lineTax;
      newTotal += lineTotal;
    });

    // Update transaction
    const { data: updatedTx, error: updateError } = await supabase
      .from('pos_transaction')
      .update({
        subtotal: newSubtotal,
        tax: newTax,
        total: newTotal
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateError) {
      console.error('Transaction update error:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction totals' });
    }

    res.json({
      line,
      transaction: updatedTx
    });
  } catch (error) {
    console.error('Add item to transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Finalize transaction with cash payment
app.post('/api/transactions/:transactionId/finalize', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { cashAmount } = req.body;

    if (!cashAmount || cashAmount <= 0) {
      return res.status(400).json({ error: 'Invalid cash amount' });
    }

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'open') {
      return res.status(400).json({ error: 'Transaction is not open' });
    }

    if (cashAmount < transaction.total) {
      return res.status(400).json({ error: 'Insufficient cash amount' });
    }

    // Update transaction status
    const { data: updatedTx, error: updateError } = await supabase
      .from('pos_transaction')
      .update({ status: 'finalized' })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to finalize transaction' });
    }

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payment')
      .insert({
        transaction_id: transactionId,
        method: 'cash',
        amount: parseFloat(cashAmount)
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Payment creation error:', paymentError);
      return res.status(500).json({ error: 'Failed to create payment record' });
    }

    // Decrease item quantities for all items in the transaction
    const { data: transactionLines, error: linesError } = await supabase
      .from('transaction_line')
      .select('item_id, quantity')
      .eq('transaction_id', transactionId);

    if (linesError) {
      console.error('Error fetching transaction lines:', linesError);
      return res.status(500).json({ error: 'Failed to fetch transaction lines' });
    }

    // Update quantities for each item
    for (const line of transactionLines) {
      // Get current item quantity
      const { data: item, error: itemError } = await supabase
        .from('item')
        .select('quantity')
        .eq('id', line.item_id)
        .single();

      if (itemError || !item) {
        console.error(`Error fetching item ${line.item_id}:`, itemError);
        continue; // Skip this item but continue with others
      }

      const currentQuantity = parseInt(item.quantity || 0);
      const soldQuantity = parseInt(line.quantity);
      const newQuantity = Math.max(0, currentQuantity - soldQuantity);

      // Update item quantity
      const { error: updateQuantityError } = await supabase
        .from('item')
        .update({ quantity: newQuantity })
        .eq('id', line.item_id);

      if (updateQuantityError) {
        console.error(`Error updating quantity for item ${line.item_id}:`, updateQuantityError);
        // Continue with other items even if one fails
      }
    }

    const change = cashAmount - transaction.total;

    res.json({
      transaction: updatedTx,
      payment,
      change: change.toFixed(2)
    });
  } catch (error) {
    console.error('Finalize transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all finalized transactions (for reports)
app.get('/api/transactions', async (req, res) => {
  try {
    const { limit = 1000, offset = 0 } = req.query;

    // Get all finalized and refunded transactions (exclude open transactions)
    const { data: transactions, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .in('status', ['finalized', 'refunded'])
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (txError) {
      console.error('Error fetching transactions:', txError);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }

    // Get all refund transactions to exclude them from reports
    const { data: refunds, error: refundsError } = await supabase
      .from('refund')
      .select('refund_tx');

    if (refundsError) {
      console.error('Error fetching refunds:', refundsError);
      // Continue anyway, but log the error
    }

    // Filter out refund transactions (transactions that are refund_tx in the refund table)
    const refundTransactionIds = new Set((refunds || []).map(r => r.refund_tx));
    
    // Also get original transaction IDs that have refunds (to help identify refund transactions)
    const originalTransactionIds = new Set((refunds || []).map(r => r.original_tx));
    
    // Filter out:
    // 1. Transactions that are refund_tx (explicit refund transactions)
    // 2. Transactions with 0 lines that are finalized (likely orphaned refund transactions)
    const salesTransactions = transactions.filter(tx => {
      // Exclude if it's a known refund transaction
      if (refundTransactionIds.has(tx.id)) {
        return false;
      }
      // Exclude finalized transactions with 0 lines (likely refund transactions without proper linking)
      // We'll check this after we get the lines
      return true;
    });

    // Get transaction lines for all sales transactions
    const transactionIds = salesTransactions.map(tx => tx.id);
    
    if (transactionIds.length === 0) {
      return res.json(salesTransactions.map(tx => ({ ...tx, lines: [] })));
    }

    const { data: allLines, error: linesError } = await supabase
      .from('transaction_line')
      .select(`
        *,
        item:item_id (
          id,
          name,
          is_active
        )
      `)
      .in('transaction_id', transactionIds);

    if (linesError) {
      console.error('Error fetching transaction lines:', linesError);
      return res.status(500).json({ error: 'Failed to fetch transaction lines' });
    }

    // Group lines by transaction_id
    const linesByTransaction = {};
    (allLines || []).forEach(line => {
      if (!linesByTransaction[line.transaction_id]) {
        linesByTransaction[line.transaction_id] = [];
      }
      linesByTransaction[line.transaction_id].push(line);
    });

    // Combine transactions with their lines and calculate refund status
    // Also filter out transactions with 0 lines that are finalized (likely orphaned refund transactions)
    const transactionsWithLines = salesTransactions
      .map(tx => {
        const lines = linesByTransaction[tx.id] || [];
        
        // Calculate refund status
        let refundStatus = 'none'; // 'none', 'partial', 'full'
        if (lines.length > 0) {
          const refundedCount = lines.filter(line => line.refunded_by !== null).length;
          if (refundedCount === lines.length) {
            refundStatus = 'full';
          } else if (refundedCount > 0) {
            refundStatus = 'partial';
          }
        }
        
        return {
          ...tx,
          lines,
          refundStatus
        };
      })
      .filter(tx => {
        // Exclude finalized transactions with 0 lines (likely orphaned refund transactions)
        // But keep refunded transactions even if they have 0 lines (edge case)
        if (tx.status === 'finalized' && tx.lines.length === 0) {
          return false;
        }
        return true;
      });

    res.json(transactionsWithLines);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel/Delete an open transaction
app.delete('/api/transactions/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Get transaction to check status
    const { data: transaction, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'open') {
      return res.status(400).json({ error: 'Only open transactions can be cancelled' });
    }

    // Delete transaction (cascade will delete transaction_lines)
    const { error: deleteError } = await supabase
      .from('pos_transaction')
      .delete()
      .eq('id', transactionId);

    if (deleteError) {
      console.error('Error deleting transaction:', deleteError);
      return res.status(500).json({ error: 'Failed to cancel transaction' });
    }

    res.json({ message: 'Transaction cancelled successfully' });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction with lines
app.get('/api/transactions/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const { data: transaction, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const { data: lines, error: linesError } = await supabase
      .from('transaction_line')
      .select(`
        *,
        item:item_id (
          id,
          name
        )
      `)
      .eq('transaction_id', transactionId);

    if (linesError) {
      return res.status(500).json({ error: 'Failed to fetch transaction lines' });
    }

    res.json({
      ...transaction,
      lines: lines || []
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process refund (partial or full)
app.post('/api/transactions/:transactionId/refund', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { lineIds } = req.body;

    if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
      return res.status(400).json({ error: 'lineIds array is required' });
    }

    // Get original transaction
    const { data: originalTransaction, error: txError } = await supabase
      .from('pos_transaction')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !originalTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (originalTransaction.status !== 'finalized') {
      return res.status(400).json({ error: 'Only finalized transactions can be refunded' });
    }

    // Get all transaction lines
    const { data: allLines, error: linesError } = await supabase
      .from('transaction_line')
      .select('*')
      .eq('transaction_id', transactionId);

    if (linesError) {
      return res.status(500).json({ error: 'Failed to fetch transaction lines' });
    }

    // Validate that selected lines exist and are not already refunded
    const selectedLines = allLines.filter(line => lineIds.includes(line.id));
    if (selectedLines.length !== lineIds.length) {
      return res.status(400).json({ error: 'Some selected lines do not exist' });
    }

    const alreadyRefundedLines = selectedLines.filter(line => line.refunded_by !== null);
    if (alreadyRefundedLines.length > 0) {
      return res.status(400).json({ error: 'Some selected lines have already been refunded' });
    }

    // Calculate refund amounts from selected lines
    let refundSubtotal = 0;
    let refundTax = 0;
    let refundTotal = 0;

    for (const line of selectedLines) {
      const lineSubtotal = parseFloat(line.unit_price) * parseInt(line.quantity);
      const lineTax = lineSubtotal * parseFloat(line.tax_rate);
      refundSubtotal += lineSubtotal;
      refundTax += lineTax;
      refundTotal += parseFloat(line.line_total);
    }

    // Create refund transaction
    const { data: refundTransaction, error: refundTxError } = await supabase
      .from('pos_transaction')
      .insert({
        status: 'finalized',
        subtotal: refundSubtotal.toFixed(2),
        tax: refundTax.toFixed(2),
        total: refundTotal.toFixed(2)
      })
      .select()
      .single();

    if (refundTxError) {
      console.error('Error creating refund transaction:', refundTxError);
      return res.status(500).json({ error: 'Failed to create refund transaction' });
    }

    // Create refund record - handle unique constraint for partial refunds
    let refundRecord;
    try {
      // Try to create new refund record
      const { data: newRefundRecord, error: refundError } = await supabase
        .from('refund')
        .insert({
          original_tx: transactionId,
          refund_tx: refundTransaction.id
        })
        .select()
        .single();

      if (refundError) {
        // If unique constraint violation, try to get existing refund record
        if (refundError.code === '23505') {
          const { data: existingRefund, error: fetchError } = await supabase
            .from('refund')
            .select('*')
            .eq('original_tx', transactionId)
            .single();

          if (fetchError || !existingRefund) {
            return res.status(500).json({ error: 'Failed to handle refund record' });
          }
          refundRecord = existingRefund;
        } else {
          throw refundError;
        }
      } else {
        refundRecord = newRefundRecord;
      }
    } catch (error) {
      console.error('Error creating refund record:', error);
      return res.status(500).json({ error: 'Failed to create refund record' });
    }

    const refundId = refundRecord.id;

    // Mark selected lines as refunded
    for (const lineId of lineIds) {
      const { error: updateLineError } = await supabase
        .from('transaction_line')
        .update({ refunded_by: refundId })
        .eq('id', lineId);

      if (updateLineError) {
        console.error(`Error updating line ${lineId}:`, updateLineError);
      }
    }

    // Increase item quantities for refunded items
    for (const line of selectedLines) {
      const { data: item, error: itemError } = await supabase
        .from('item')
        .select('quantity')
        .eq('id', line.item_id)
        .single();

      if (itemError || !item) {
        console.error(`Error fetching item ${line.item_id}:`, itemError);
        continue;
      }

      const currentQuantity = parseInt(item.quantity || 0);
      const refundedQuantity = parseInt(line.quantity);
      const newQuantity = currentQuantity + refundedQuantity;

      const { error: updateQuantityError } = await supabase
        .from('item')
        .update({ quantity: newQuantity })
        .eq('id', line.item_id);

      if (updateQuantityError) {
        console.error(`Error updating quantity for item ${line.item_id}:`, updateQuantityError);
      }
    }

    // Check if all lines are now refunded
    const { data: remainingLines, error: remainingError } = await supabase
      .from('transaction_line')
      .select('refunded_by')
      .eq('transaction_id', transactionId);

    if (!remainingError && remainingLines) {
      const allRefunded = remainingLines.every(line => line.refunded_by !== null);
      if (allRefunded) {
        // Mark original transaction as refunded
        await supabase
          .from('pos_transaction')
          .update({ status: 'refunded' })
          .eq('id', transactionId);
      }
    }

    // Create payment record with negative amount
    const { error: paymentError } = await supabase
      .from('payment')
      .insert({
        transaction_id: refundTransaction.id,
        method: 'cash',
        amount: -refundTotal.toFixed(2)
      });

    if (paymentError) {
      console.error('Payment creation error:', paymentError);
      // Don't fail the refund if payment record creation fails
    }

    // Check if this is a partial refund
    const isPartial = remainingLines && remainingLines.some(line => line.refunded_by === null);

    res.json({
      refundAmount: refundTotal.toFixed(2),
      originalTransaction,
      refundTransaction,
      isPartial
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

