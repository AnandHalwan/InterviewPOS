import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Sample items to insert
const items = [
  {
    name: 'Coca Cola',
    price: 2.99,
    tax_rate: 0.0875, // 8.75%
    quantity: 24,
    cost: 1.50,
    pack_size: 1,
    is_active: true
  },
  {
    name: 'Chips',
    price: 3.49,
    tax_rate: 0.0875,
    quantity: 12,
    cost: 1.75,
    pack_size: 1,
    is_active: true
  },
  {
    name: 'Chocolate Bar',
    price: 1.99,
    tax_rate: 0.0875,
    quantity: 36,
    cost: 0.75,
    pack_size: 1,
    is_active: true
  },
  {
    name: 'Bottled Water',
    price: 1.49,
    tax_rate: 0.0875,
    quantity: 48,
    cost: 0.50,
    pack_size: 1,
    is_active: true
  },
  {
    name: 'Sandwich',
    price: 5.99,
    tax_rate: 0.0875,
    quantity: 10,
    cost: 2.50,
    pack_size: 1,
    is_active: true
  }
];

// Simple barcodes for easy testing
const barcodes = ['123', '456', '789', '111', '222'];

async function seedDatabase() {
  console.log('Starting database seed...\n');

  try {
    // Insert items
    console.log('Inserting items...');
    const { data: insertedItems, error: itemsError } = await supabase
      .from('item')
      .insert(items)
      .select();

    if (itemsError) {
      console.error('Error inserting items:', itemsError);
      process.exit(1);
    }

    console.log(`✓ Successfully inserted ${insertedItems.length} items\n`);

    // Insert barcodes for each item
    console.log('Inserting barcodes...');
    const barcodeInserts = insertedItems.map((item, index) => ({
      item_id: item.id,
      barcode: barcodes[index]
    }));

    const { data: insertedBarcodes, error: barcodesError } = await supabase
      .from('item_barcode')
      .insert(barcodeInserts)
      .select();

    if (barcodesError) {
      console.error('Error inserting barcodes:', barcodesError);
      process.exit(1);
    }

    console.log(`✓ Successfully inserted ${insertedBarcodes.length} barcodes\n`);

    // Add a second barcode to the first item (Coca Cola) to test multiple barcodes
    console.log('Adding additional barcode to Coca Cola...');
    const { data: additionalBarcode, error: additionalBarcodeError } = await supabase
      .from('item_barcode')
      .insert({
        item_id: insertedItems[0].id,
        barcode: '999'
      })
      .select()
      .single();

    if (additionalBarcodeError) {
      console.error('Error inserting additional barcode:', additionalBarcodeError);
      process.exit(1);
    }

    console.log(`✓ Successfully added additional barcode '999' to Coca Cola\n`);

    // Display summary
    console.log('=== SEED SUMMARY ===\n');
    insertedItems.forEach((item, index) => {
      console.log(`${item.name}`);
      console.log(`  Price: $${item.price.toFixed(2)}`);
      if (index === 0) {
        console.log(`  Barcodes: ${barcodes[index]}, 999 (multiple barcodes)`);
      } else {
        console.log(`  Barcode: ${barcodes[index]}`);
      }
      console.log(`  Item ID: ${item.id}`);
      console.log('');
    });

    console.log('✓ Database seed completed successfully!');
    console.log('\nYou can now test with these barcodes:');
    console.log(barcodes.join(', ') + ', 999');
    console.log('\nNote: Coca Cola has two barcodes (123 and 999) - both will work!');

  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

seedDatabase();

