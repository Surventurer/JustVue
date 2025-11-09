// Code snippets storage
let codeSnippets = [];

// DOM elements
const searchInput = document.getElementById('searchInput');
const titleInput = document.getElementById('titleInput');
const codeInput = document.getElementById('codeInput');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');

// Load saved snippets from localStorage
loadFromLocalStorage();

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
    
    saveToLocalStorage();
    renderCodeList();
}

// Delete code function
function deleteCode(id) {
    codeSnippets = codeSnippets.filter(snippet => snippet.id !== id);
    saveToLocalStorage();
    renderCodeList();
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

// Save to localStorage
function saveToLocalStorage() {
    localStorage.setItem('codeSnippets', JSON.stringify(codeSnippets));
}

// Load from localStorage
function loadFromLocalStorage() {
    const saved = localStorage.getItem('codeSnippets');
    if (saved) {
        codeSnippets = JSON.parse(saved);
        renderCodeList();
    } else {
        renderCodeList();
    }
}

// Initial render
renderCodeList();
