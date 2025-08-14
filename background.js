const TAB_GROUP_NAME = "help.ai";

// Background service worker for AI Help extension

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'openWithImage') {
        const result = await chrome.storage.sync.get(['imagePrompt']);
        const imagePrompt = result.imagePrompt || 'What do you see in this image?';
        await openAllSelectedServices(message.prompt || imagePrompt, message.imageData);
    }
});
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
            id: "aiSnipImage",
            title: "AI Help Image Snip",
            contexts: ["page", "frame"]
        });
    } catch (error) {
        console.error('Error during extension installation:', error);
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        // Get saved prompts from storage
        const result = await chrome.storage.sync.get(['selectionPrompt', 'pagePrompt']);
        const selectionPrompt = result.selectionPrompt || 'What does this mean: ';
        const pagePrompt = result.pagePrompt || 'Please explain what this webpage is about: ';
        
        if (info.menuItemId === 'aiHelpSelection') {
            // User selected text, ask AI about the selection
            await openAllSelectedServices(selectionPrompt + info.selectionText);
        } else if (info.menuItemId === 'aiSnipImage') {
            // User wants to snip an image
            await handleSnipImage(tab);
        }
    } catch (error) {
        console.error('Error handling context menu click:', error);
    }
});

// Function to handle image snipping
async function handleSnipImage(tab) {
    try {
        // Capture screenshot of visible tab
        console.log('Capturing screenshot for snipping...');
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: 'png'
        });
        console.log('Screenshot captured:', screenshotDataUrl);
        
        // Inject content script to show cropping interface
        console.log('Attempting to inject content script into tab:', tab.id);
        try {
            // Try file-based injection first
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['scripts/crop-interface.js']
            });
            console.log('File injection result:', result);
            
            // Then call the function with screenshot data
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (dataUrl) => {
                    if (typeof showImageCroppingInterface === 'function') {
                        showImageCroppingInterface(dataUrl);
                    } else {
                        alert('Cropping interface not available. Please try again.');
                    }
                },
                args: [screenshotDataUrl]
            });
        } catch (injectionError) {
            console.error('Failed to inject content script:', injectionError);
            // Fallback to function injection
            try {
                const result = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: showImageCroppingInterface,
                    args: [screenshotDataUrl]
                });
                console.log('Function injection fallback result:', result);
            } catch (functionError) {
                console.error('Function injection also failed:', functionError);
                // Show a simple alert as final fallback
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (errorMsg) => {
                            alert('Snip Image failed: ' + errorMsg + '\n\nThis might happen on pages with strict security policies. Try on a different webpage.');
                        },
                        args: [injectionError.message]
                    });
                } catch (alertError) {
                    console.error('Could not even show error alert:', alertError);
                }
            }
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error);
    }
}

// Function to open all selected AI services
async function openAllSelectedServices(text, imageData = null) {
    try {
        // Get selected services from storage
        const result = await chrome.storage.sync.get(['selectedServices']);
        const selectedServices = result.selectedServices || ['https://chatgpt.com/'];
        
        console.log('Opening services:', selectedServices);
        
        // Open each selected service
        for (const serviceUrl of selectedServices) {
            await openPageWithText(serviceUrl, text, imageData);
        }
    } catch (error) {
        console.error('Error opening selected services:', error);
        // Fallback to ChatGPT only
        await openPageWithText('https://chatgpt.com/', text, imageData);
    }
}


// Function to open ChatGPT with text injection
async function openPageWithText(page, text, imageData = null) {
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
        
        // Only inject text/image for ChatGPT (as it has the most robust implementation)
        if (page.includes('chatgpt.com')) {
            if (imageData) {
                injectImageIntoTab(tab.id, imageData, text, isExistingTab);
            } else {
                injectTextIntoTab(tab.id, text, isExistingTab);
            }
        } else {
            // For other services, copy text/image to clipboard and show notification
            try {
                if (imageData) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: copyImageToClipboardFallback,
                        args: [imageData, text]
                    });
                } else {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: copyToClipboardFallback,
                        args: [text]
                    });
                }
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

// Function to inject image into tab
function injectImageIntoTab(tabId, imageData, text, append) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: pasteImageIntoInputSelector,
        args: [imageData, text, append]
    }).catch(error => {
        console.error('Failed to inject image:', error);
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: copyImageToClipboardFallback,
            args: [imageData, text]
        });
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

// Function to handle image pasting in ChatGPT (injected function)
function pasteImageIntoInputSelector(imageDataUrl, text, append) {
    console.log('Attempting to paste image into ChatGPT');
    
    // For now, copy image to clipboard and show instructions
    // ChatGPT image upload is complex and may require different approaches
    fetch(imageDataUrl)
        .then(res => res.blob())
        .then(blob => {
            const item = new ClipboardItem({ 'image/png': blob });
            return navigator.clipboard.write([item]);
        })
        .then(() => {
            alert('Image copied to clipboard! Please paste (Ctrl+V) into ChatGPT.\n\nPrompt: ' + text);
        })
        .catch(error => {
            console.error('Failed to copy image to clipboard:', error);
            alert('Please manually upload the image to ChatGPT.\n\nPrompt: ' + text);
        });
}

// Fallback function for image copying to clipboard
function copyImageToClipboardFallback(imageDataUrl, text) {
    fetch(imageDataUrl)
        .then(res => res.blob())
        .then(blob => {
            const item = new ClipboardItem({ 'image/png': blob });
            return navigator.clipboard.write([item]);
        })
        .then(() => {
            alert('Image copied to clipboard! Please paste (Ctrl+V) into the AI service.\n\nPrompt: ' + text);
        })
        .catch(error => {
            console.error('Failed to copy image to clipboard:', error);
            alert('Please manually upload the image to the AI service.\n\nPrompt: ' + text);
        });
}
