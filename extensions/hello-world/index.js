// Hello World - ByteCode Extension

// The ByteCode API is available as the global "bytecode" object.
bytecode.hooks.on('editor:ready', () => {
  bytecode.ui.showNotification('✅ Hello World loaded!', 'success');
});
