// GitLens Extension (Mock)
// This is a placeholder extension. Real implementation would require git CLI integration.

(function () {
    bytecode.ui.addStatusBarItem('gitlens-status', '🔍 GitLens', () => {
        bytecode.ui.showNotification('GitLens is enabled (mock). Git blame would go here.', 'info');
    });

    console.log('GitLens extension loaded (mock).');
})();
