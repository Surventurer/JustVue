# Auto-Update Feature Documentation

## Overview

The Code Manager now includes **automatic data synchronization** that keeps your snippets up-to-date without requiring manual page refreshes.

## How It Works

### Automatic Polling
- The application checks for data updates every **5 seconds**
- Uses intelligent hash-based change detection to avoid unnecessary UI updates
- Silently handles connection errors without disrupting user experience

### Visual Indicators

#### Live Status Indicator
Located in the top-right corner of the page:
- 🟢 **Green dot + "Live"** - Auto-update is active and checking for changes
- 🟠 **Orange dot + "Paused"** - Auto-update is temporarily paused

#### Update Notifications
When new data is detected:
- A subtle notification slides in from the right
- Shows the number of items added or removed
- Automatically disappears after 3 seconds

### Smart Behavior

#### Automatic Pausing
Auto-update **pauses automatically** when you:
- Type in the password field
- Type in the title field
- Type in the code/text area

This prevents your work from being interrupted by incoming updates.

#### Automatic Resumption
- Auto-update **resumes automatically** 10 seconds after you stop typing
- Ensures you don't miss updates while working on other tasks

## Manual Controls

You can control the auto-update feature via the browser console:

```javascript
// Stop auto-update
codeManagerControls.stopAutoUpdate()

// Start auto-update
codeManagerControls.startAutoUpdate()

// Check for updates immediately
codeManagerControls.checkForUpdates()

// Change update interval (in seconds)
codeManagerControls.setUpdateInterval(10) // Check every 10 seconds

// Check current status
codeManagerControls.getCurrentInterval()
```

## Benefits

1. **Multi-Device Collaboration** - Changes made on one device appear on others automatically
2. **No Manual Refresh** - Users don't need to press F5 or reload the page
3. **Seamless Experience** - Updates happen in the background without interruption
4. **Smart Pausing** - Respects user activity and doesn't interfere with typing
5. **Efficient** - Only updates UI when actual changes are detected

## Technical Details

### Change Detection
- Uses a lightweight hash function on snippet metadata (ID, title, timestamp)
- Compares hash values to detect changes without deep object comparison
- Normalizes data IDs to ensure consistent comparison

### Network Efficiency
- Only downloads full data when checking for updates
- Handles network failures gracefully
- Does not retry failed requests (waits for next scheduled check)

### Performance
- Minimal CPU usage (hash calculation is very fast)
- No memory leaks (uses efficient Set and Map structures)
- Smooth animations using CSS transitions

## Customization

### Changing the Default Interval

To change the default 5-second interval, edit the `startAutoUpdate()` call in `script.js`:

```javascript
// In initializeApp() function
startAutoUpdate(10000); // Change to 10 seconds
```

### Disabling Auto-Update

To disable auto-update by default, comment out the `startAutoUpdate()` line:

```javascript
async function initializeApp() {
    await loadFromDatabaseJSON();
    renderCodeList();
    // startAutoUpdate(); // Disabled
}
```

Users can still enable it manually via console commands.

## Browser Compatibility

The auto-update feature uses standard JavaScript APIs:
- `setInterval` / `clearInterval` - Universal support
- `fetch` API - All modern browsers
- ES6 Map and Set - All modern browsers
- CSS animations - All modern browsers

**Supported browsers:**
- Chrome/Edge 60+
- Firefox 55+
- Safari 12+
- Opera 47+

## Troubleshooting

### Auto-update not working

1. Check browser console for errors
2. Verify network connectivity
3. Ensure the backend API is accessible
4. Try manual control: `codeManagerControls.startAutoUpdate()`

### Updates too frequent/infrequent

Adjust the interval via console:
```javascript
codeManagerControls.setUpdateInterval(15) // 15 seconds
```

### Want to disable notifications

Edit the `checkForUpdates()` function and comment out:
```javascript
// showUpdateNotification(change);
```
