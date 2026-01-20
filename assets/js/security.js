// ===== Security Module for JustVue =====
// TEMPORARILY DISABLED FOR DEBUGGING

(function() {
    'use strict';
    
    // Disable right-click context menu
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Disable keyboard shortcuts for dev tools
    document.addEventListener('keydown', function(e) {
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I (Dev Tools)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+J (Console)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+C (Inspect Element)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
        // Cmd+Option+I (Mac Dev Tools)
        if (e.metaKey && e.altKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }
        // Cmd+Option+J (Mac Console)
        if (e.metaKey && e.altKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }
        // Cmd+Option+C (Mac Inspect)
        if (e.metaKey && e.altKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }
        // Cmd+Option+U (Mac View Source)
        if (e.metaKey && e.altKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
    });
    
    // Detect dev tools opening via window size change
    let devToolsOpen = false;
    const threshold = 160;
    
    const checkDevTools = function() {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!devToolsOpen) {
                devToolsOpen = true;
                onDevToolsOpen();
            }
        } else {
            devToolsOpen = false;
        }
    };
    
    const onDevToolsOpen = function() {
        // Clear console and show warning
        console.clear();
        console.log('%c⚠️ Warning!', 'color: red; font-size: 40px; font-weight: bold;');
        console.log('%cThis browser feature is intended for developers.', 'font-size: 16px;');
        console.log('%cIf someone told you to copy-paste something here, it\'s likely a scam.', 'font-size: 14px; color: orange;');
    };
    
    // Check periodically
    setInterval(checkDevTools, 1000);
    
    // Disable text selection on sensitive elements (optional - can be removed if not wanted)
    // document.body.style.userSelect = 'none';
    
    // Disable drag and drop
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Clear console on load
    if (typeof console.clear === 'function') {
        console.clear();
    }
    
    // Override console methods to limit information leakage (optional)
    // Uncomment if you want to disable console entirely
     const noop = function() {};
     ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace'].forEach(function(method) {
         console[method] = noop;
    });
    
})();

