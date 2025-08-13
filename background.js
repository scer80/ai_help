const TAB_GROUP_NAME = "help.ai";

// Background service worker for AI Help extension
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // Open the side panel when the extension icon is clicked
        await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});

// Set up the side panel to be available on all sites
chrome.runtime.onInstalled.addListener(() => {
    try {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        
        // Create context menu items
        chrome.contextMenus.create({
            id: "aiHelpSelection",
            title: "AI help with '%s'",
            contexts: ["selection"]
        });
        
        chrome.contextMenus.create({
            id: "aiHelpPage",
            title: "AI help",
            contexts: ["page", "frame", "link", "image"]
        });
    } catch (error) {
        console.error('Error during extension installation:', error);
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        if (info.menuItemId === 'aiHelpSelection') {
            // User selected text, ask AI about the selection
            await openAllSelectedServices(info.selectionText);
        } else if (info.menuItemId === 'aiHelpPage') {
            // No selection, ask AI to explain the page
            await openAllSelectedServices(`Please explain what this webpage is about: ${info.pageUrl || tab.url}`);
        }
    } catch (error) {
        console.error('Error handling context menu click:', error);
    }
});

// Function to open all selected AI services
async function openAllSelectedServices(text) {
    try {
        // Get selected services from storage
        const result = await chrome.storage.sync.get(['selectedServices']);
        const selectedServices = result.selectedServices || ['https://chatgpt.com/'];
        
        console.log('Opening services:', selectedServices);
        
        // Open each selected service
        for (const serviceUrl of selectedServices) {
            await openPageWithText(serviceUrl, text);
        }
    } catch (error) {
        console.error('Error opening selected services:', error);
        // Fallback to ChatGPT only
        await openPageWithText('https://chatgpt.com/', text);
    }
}


// Function to open ChatGPT with text injection
async function openPageWithText(page, text) {
    try {
        // Check if a group with the title 'help.ai' already exists
        const tabGroups = await chrome.tabGroups.query({ title: TAB_GROUP_NAME });
        const existingGroup = tabGroups.length > 0 ? tabGroups[0] : null;

        // If group exists, check for existing tab
        let tab = null;
        let isExistingTab = false;
        if (existingGroup) {
            const tabs = await chrome.tabs.query({ groupId: existingGroup.id });
            tab = tabs.find(t => t.url && t.url.includes(page));
            isExistingTab = !!tab;
        }

        // If no existing tab found, create a new one
        if (!tab) {
            tab = await chrome.tabs.create({ url: page, active: true });

            // Add tab to existing group or create new group
            if (existingGroup) {
                await chrome.tabs.group({
                    tabIds: [tab.id],
                    groupId: existingGroup.id
                });
            } else {
                const newGroup = await chrome.tabs.group({
                    tabIds: [tab.id]
                });
                await chrome.tabGroups.update(newGroup, { 
                    title: TAB_GROUP_NAME,
                    collapsed: false
                });
            }
        }

        // Focus the tab (whether new or existing)
        await chrome.tabs.update(tab.id, { active: true });

        if (!isExistingTab) {
            // Wait for the tab to finish loading
            await waitForTabUpdate(tab.id);
        }
        
        // Only inject text for ChatGPT (as it has the most robust implementation)
        if (page.includes('chatgpt.com')) {
            injectTextIntoTab(tab.id, text, isExistingTab);
        } else {
            // For other services, copy text to clipboard and show notification
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: copyToClipboardFallback,
                    args: [text]
                });
            } catch (error) {
                console.log('Could not copy to clipboard for', page);
            }
        }

    } catch (error) {
        console.error('Failed to open ${page}:', error);
    }
}

function waitForTabUpdate(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(changeInfo);
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        // Set a timeout to reject the promise if the event doesn't occur
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Tab update timed out'));
        }, timeout);
    });
}

// Updated injectTextIntoTab function
function injectTextIntoTab(tabId, text, append) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: pasteTextIntoInputSelector,
        args: [text, append]
    }).catch(error => {
        console.error('Failed to inject text:', error);
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: copyToClipboardFallback,
            args: [text]
        });
    });
}


// This function will be injected into the ChatGPT page
function pasteTextIntoInputSelector(text, append) {
    console.log('pasteTextIntoInputSelector', text, append);
    // Function to wait for element to appear
    function waitForElement(selectors, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            function check() {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        return;
                    }
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error('No input elements found within ' + timeout + 'ms'));
                } else {
                    setTimeout(check, 200);
                }
            }
            check();
        });
    }

    // Multiple selectors to try for ChatGPT's input field
    const inputSelectors = [
        'textarea[data-id="root"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        '#prompt-textarea',
        'textarea[data-testid="textbox"]',
        'div[contenteditable="true"]',
        'div[role="textbox"]',
        'textarea',
        '[data-testid="composer-text-input"]',
        'main textarea'
    ];

    // Wait for ChatGPT's input field and append the text
    waitForElement(inputSelectors)
        .then(inputElement => {
            // Focus the input element
            inputElement.focus();
            console.log('waitForElement found input element:', inputElement);
            // Append the text based on element type
            if (inputElement.tagName === 'TEXTAREA') {
                console.log('Text to textarea');
                console.log('Current value:', inputElement.value);
                console.log('Text to append:', text);
                if (append) {
                    inputElement.value += (inputElement.value ? '\n' : '') + text;
                } else {
                    inputElement.value = text;
                }                
                // Trigger input and change events
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (inputElement.contentEditable === 'true') {
                console.log('Text to contenteditable div');
                console.log('Current value:', inputElement.value);
                console.log('Text to append:', text);
                if (append) {
                    //inputElement.textContent += (inputElement.textContent ? '\n' : '') + text;
                    inputElement.innerHTML += (inputElement.innerHTML ? '<br>' : '') + text;
                } else {
                    inputElement.textContent = text;
                }
                // Trigger input event for contenteditable div
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Trigger additional events that might be needed
            inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            
            console.log('Text successfully appended to input field');
        })
        .catch(error => {
            console.error('Could not find input field:', error);
            // Fallback: copy to clipboard and show alert
            copyToClipboard(text);
        });
}

// Fallback function to copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('ChatGPT is ready! Your text has been copied to clipboard. Please paste it (Ctrl+V) into the input field.\n\nText: "' + text.substring(0, 100) + (text.length > 100 ? '...' : '') + '"');
    }).catch(() => {
        alert('Please manually type this text into ChatGPT:\n\n"' + text.substring(0, 200) + (text.length > 200 ? '...' : '') + '"');
    });
}

// Fallback function for non-ChatGPT services
function copyToClipboardFallback(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('AI service is ready! Your text has been copied to clipboard. Please paste it (Ctrl+V) into the input field.\n\nText: "' + text.substring(0, 100) + (text.length > 100 ? '...' : '') + '"');
    }).catch(() => {
        alert('Please manually type this text:\n\n"' + text.substring(0, 200) + (text.length > 200 ? '...' : '') + '"');
    });
}
