const lancedb = require('vectordb');

async function testConnection() {
  try {
    console.log('Testing LanceDB connection...');
    
    const db = await lancedb.connect('./test_db', {
      storageOptions: {
        enableV2ManifestPaths: false,
        maxVersions: 1
      }
    });
    
    console.log('LanceDB connection successful!');
    
    const tableNames = await db.tableNames();
    console.log('Table names:', tableNames);
    
    process.exit(0);
    
  } catch (error) {
    console.error('LanceDB connection failed:', error);
    process.exit(1);
  }
}

testConnection();