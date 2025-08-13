// Side panel JavaScript for AI Help extension

// Load saved service selections on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const result = await chrome.storage.sync.get(['selectedServices']);
        const selectedServices = result.selectedServices || ['https://chatgpt.com/', 'https://claude.ai', 'https://grok.com/'];
        
        // Update checkboxes based on saved selections
        const checkboxes = document.querySelectorAll('input[name="service"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectedServices.includes(checkbox.value);
        });
    } catch (error) {
        console.error('Error loading saved selections:', error);
    }
});

// Save service selections when checkboxes change
document.addEventListener('change', function(event) {
    if (event.target.name === 'service') {
        saveSelectedServices();
    }
});

async function saveSelectedServices() {
    try {
        const checkboxes = document.querySelectorAll('input[name="service"]:checked');
        const selectedServices = Array.from(checkboxes).map(cb => cb.value);
        
        await chrome.storage.sync.set({ selectedServices: selectedServices });
        console.log('Selected services saved:', selectedServices);
    } catch (error) {
        console.error('Error saving selected services:', error);
    }
}

