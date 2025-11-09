// Code snippets storage
let codeSnippets = [];
let githubToken = '';
let gistId = '';
let isSyncing = false;
let autoSyncEnabled = true;
let isNetlifyDeployment = false;

// DOM elements
const searchInput = document.getElementById('searchInput');
const titleInput = document.getElementById('titleInput');
const codeInput = document.getElementById('codeInput');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');
const setupBtn = document.getElementById('setupBtn');
const syncBtn = document.getElementById('syncBtn');
const setupModal = document.getElementById('setupModal');
const closeModal = document.getElementById('closeModal');
const tokenInput = document.getElementById('tokenInput');
const saveTokenBtn = document.getElementById('saveTokenBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Initialize app
initializeApp();

// Add event listener for Add button
addBtn.addEventListener('click', addCode);

// Add event listener for search input
searchInput.addEventListener('input', renderCodeList);

// Add event listener for Enter key in title (Enter to focus on code)
titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        codeInput.focus();
    }
});

// Add event listener for Enter key (Ctrl/Cmd + Enter to add)
codeInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        addCode();
    }
});

// GitHub Sync Event Listeners
setupBtn.addEventListener('click', () => {
    setupModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
    setupModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === setupModal) {
        setupModal.style.display = 'none';
    }
});

saveTokenBtn.addEventListener('click', saveGitHubToken);

syncBtn.addEventListener('click', syncWithGitHub);

// Add code function
function addCode() {
    const title = titleInput.value.trim();
    const code = codeInput.value.trim();
    
    if (title === '') {
        alert('Please enter a title!');
        titleInput.focus();
        return;
    }
    
    if (code === '') {
        alert('Please enter some code!');
        codeInput.focus();
        return;
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        code: code,
        timestamp: new Date().toLocaleString()
    };
    
    codeSnippets.unshift(snippet);
    titleInput.value = '';
    codeInput.value = '';
    titleInput.focus();
    
    renderCodeList();
    
    // Auto-sync to GitHub after adding
    if (githubToken && gistId && autoSyncEnabled) {
        autoSyncToGitHub();
    }
}

// Delete code function
function deleteCode(id) {
    if (!confirm('Are you sure you want to delete this snippet?')) {
        return;
    }
    
    codeSnippets = codeSnippets.filter(snippet => snippet.id !== id);
    renderCodeList();
    
    // Auto-sync to GitHub after deleting
    if (githubToken && gistId && autoSyncEnabled) {
        autoSyncToGitHub();
    }
}

// Copy to clipboard function
function copyToClipboard(code, button) {
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Render code list
function renderCodeList() {
    if (codeSnippets.length === 0) {
        codeList.innerHTML = '<div class="empty-state">No code snippets yet. Add your first snippet above!</div>';
        return;
    }
    
    // Get search query
    const searchQuery = searchInput.value.trim().toLowerCase();
    
    // Filter snippets based on search query
    const filteredSnippets = searchQuery === '' 
        ? codeSnippets 
        : codeSnippets.filter(snippet => 
            snippet.title.toLowerCase().includes(searchQuery)
          );
    
    // Check if no results found
    if (filteredSnippets.length === 0) {
        codeList.innerHTML = '<div class="no-results">No snippets found matching your search.</div>';
        return;
    }
    
    codeList.innerHTML = filteredSnippets.map(snippet => {
        // Highlight search term in title
        const highlightedTitle = searchQuery === ''
            ? escapeHtml(snippet.title)
            : highlightText(escapeHtml(snippet.title), searchQuery);
        
        return `
            <div class="code-item">
                <div class="code-title">${highlightedTitle}</div>
                <div class="timestamp">Added: ${snippet.timestamp}</div>
                <div class="code-content">${escapeHtml(snippet.code)}</div>
                <div class="code-actions">
                    <button class="btn btn-copy" onclick="copyToClipboard(\`${escapeForJS(snippet.code)}\`, this)">
                        📋 Copy to Clipboard
                    </button>
                    <button class="btn btn-delete" onclick="deleteCode(${snippet.id})">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Highlight matching text in search results
function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape for JavaScript string
function escapeForJS(text) {
    return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// Initial render
renderCodeList();

// ===== GitHub Gist Functions =====

// Initialize the app
async function initializeApp() {
    // Check if running on Netlify
    if (window.location.hostname.includes('netlify.app') || 
        window.location.hostname.includes('.netlify.app')) {
        isNetlifyDeployment = true;
        await loadTokenFromNetlify();
    } else {
        loadGitHubConfig();
    }
    
    updateSyncUI();
}

// Load token from Netlify function
async function loadTokenFromNetlify() {
    try {
        statusText.textContent = 'Connecting to GitHub...';
        
        const response = await fetch('/.netlify/functions/get-token');
        
        if (!response.ok) {
            throw new Error('Token not configured in Netlify');
        }
        
        const data = await response.json();
        
        if (data.success && data.token) {
            githubToken = data.token;
            // Also load gistId from localStorage if exists
            gistId = localStorage.getItem('gistId') || '';
            
            // Hide setup button on Netlify deployment
            if (setupBtn) {
                setupBtn.style.display = 'none';
            }
            
            console.log('✅ Token loaded from Netlify');
            
            // Load or create gist
            await loadOrCreateGist();
        } else {
            throw new Error('Invalid token response');
        }
    } catch (error) {
        console.error('Error loading token from Netlify:', error);
        statusIndicator.className = 'status-indicator disconnected';
        statusText.textContent = '⚠️ GitHub token not configured in Netlify';
        alert('⚠️ Administrator: Please configure GITHUB_TOKEN in Netlify environment variables');
    }
}

function loadGitHubConfig() {
    try {
        githubToken = localStorage.getItem('githubToken') || '';
        gistId = localStorage.getItem('gistId') || '';
    } catch (error) {
        console.error('Error loading GitHub config:', error);
    }
}

async function saveGitHubToken() {
    const token = tokenInput.value.trim();
    
    if (!token) {
        alert('Please enter a GitHub token!');
        return;
    }
    
    // Verify token by making a test API call
    statusText.textContent = 'Verifying token...';
    
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            alert('❌ Invalid token! Please check and try again.');
            statusText.textContent = 'Token verification failed';
            return;
        }
        
        githubToken = token;
        localStorage.setItem('githubToken', githubToken);
        tokenInput.value = '';
        setupModal.style.display = 'none';
        
        updateSyncUI();
        
        // Try to load existing data or create new gist
        await loadOrCreateGist();
        
    } catch (error) {
        console.error('Token verification error:', error);
        alert('❌ Failed to verify token. Please check your internet connection.');
        statusText.textContent = 'Connection failed';
    }
}

function updateSyncUI() {
    if (githubToken) {
        // Hide setup button if on Netlify or token exists
        if (isNetlifyDeployment) {
            setupBtn.style.display = 'none';
        } else {
            setupBtn.style.display = 'none';
        }
        
        syncBtn.style.display = 'inline-block';
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = gistId ? `Connected to GitHub (${codeSnippets.length} snippets)` : 'Connected - Setting up...';
    } else {
        if (isNetlifyDeployment) {
            setupBtn.style.display = 'none';
            statusIndicator.className = 'status-indicator disconnected';
            statusText.textContent = '⚠️ Admin: Configure token in Netlify';
        } else {
            setupBtn.style.display = 'inline-block';
            syncBtn.style.display = 'none';
            statusIndicator.className = 'status-indicator disconnected';
            statusText.textContent = '⚠️ Setup GitHub to save your data';
        }
    }
}

async function syncWithGitHub() {
    if (!githubToken) {
        alert('⚠️ Please setup GitHub token first to save your data!');
        setupModal.style.display = 'block';
        return;
    }
    
    if (isSyncing) {
        return; // Silent skip if already syncing
    }
    
    isSyncing = true;
    statusIndicator.className = 'status-indicator syncing';
    statusText.textContent = 'Syncing...';
    syncBtn.disabled = true;
    
    try {
        if (gistId) {
            // Update existing gist
            await updateGist();
        } else {
            // Create new gist
            await createGist();
        }
        
        statusIndicator.className = 'status-indicator connected';
        const time = new Date().toLocaleTimeString();
        statusText.textContent = `Connected (${codeSnippets.length} snippets) - Last synced: ${time}`;
        console.log('✅ Synced successfully');
    } catch (error) {
        console.error('Sync error:', error);
        statusIndicator.className = 'status-indicator disconnected';
        statusText.textContent = 'Sync failed - Check connection';
        alert('❌ Sync failed: ' + error.message + '\n\nPlease check your internet connection and token.');
    } finally {
        isSyncing = false;
        syncBtn.disabled = false;
    }
}

// Auto-sync function (silent, no alerts)
async function autoSyncToGitHub() {
    if (!githubToken || !gistId || isSyncing) {
        return;
    }
    
    isSyncing = true;
    
    try {
        await updateGist();
        console.log('✅ Auto-synced to GitHub');
        updateSyncUI();
    } catch (error) {
        console.error('Auto-sync error:', error);
    } finally {
        isSyncing = false;
    }
}

async function createGist() {
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            description: 'Code Manager - My Code Snippets',
            public: false,
            files: {
                'code-snippets.json': {
                    content: JSON.stringify(codeSnippets, null, 2)
                }
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create gist');
    }
    
    const data = await response.json();
    gistId = data.id;
    localStorage.setItem('gistId', gistId);
    console.log('Gist created:', gistId);
}

async function updateGist() {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            files: {
                'code-snippets.json': {
                    content: JSON.stringify(codeSnippets, null, 2)
                }
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update gist');
    }
    
    console.log('Gist updated:', gistId);
}

async function loadFromGist() {
    if (!githubToken || !gistId) return false;
    
    try {
        statusText.textContent = 'Loading from GitHub...';
        
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load from gist');
        }
        
        const data = await response.json();
        const content = data.files['code-snippets.json'].content;
        const cloudSnippets = JSON.parse(content);
        
        codeSnippets = cloudSnippets;
        renderCodeList();
        updateSyncUI();
        
        console.log('✅ Loaded from GitHub:', cloudSnippets.length, 'snippets');
        return true;
    } catch (error) {
        console.error('Error loading from gist:', error);
        return false;
    }
}

async function loadOrCreateGist() {
    statusText.textContent = 'Checking for existing data...';
    
    // Try to find existing gist
    try {
        const response = await fetch('https://api.github.com/gists', {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const gists = await response.json();
            const existingGist = gists.find(g => 
                g.description === 'Code Manager - My Code Snippets' && 
                g.files['code-snippets.json']
            );
            
            if (existingGist) {
                gistId = existingGist.id;
                localStorage.setItem('gistId', gistId);
                await loadFromGist();
                statusText.textContent = `✅ Connected (${codeSnippets.length} snippets loaded)`;
                return;
            }
        }
    } catch (error) {
        console.error('Error checking existing gists:', error);
    }
    
    // Create new gist if none exists
    try {
        await createGist();
        statusText.textContent = '✅ Connected - Ready to save!';
    } catch (error) {
        console.error('Error creating gist:', error);
        statusText.textContent = '❌ Failed to setup - Try again';
    }
}

// Load from GitHub on startup if configured
if (githubToken && gistId) {
    loadFromGist().then(success => {
        if (success) {
            console.log('✅ Data loaded from GitHub');
        } else {
            console.log('⚠️ Using empty state');
            renderCodeList();
        }
    });
} else if (githubToken && !gistId) {
    loadOrCreateGist();
} else {
    renderCodeList();
}
