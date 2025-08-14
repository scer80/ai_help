// Side panel JavaScript for AI Help extension

// Load saved service selections and prompts on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const result = await chrome.storage.sync.get(['selectedServices', 'selectionPrompt', 'pagePrompt']);
        const selectedServices = result.selectedServices || ['https://chatgpt.com/'];
        const selectionPrompt = result.selectionPrompt || 'What does this mean: ';
        const pagePrompt = result.pagePrompt || 'Please explain what this webpage is about: ';
        
        // Update checkboxes based on saved selections
        const checkboxes = document.querySelectorAll('input[name="service"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectedServices.includes(checkbox.value);
        });
        
        // Update prompt text areas
        document.getElementById('selectionPrompt').value = selectionPrompt;
        document.getElementById('pagePrompt').value = pagePrompt;
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

// Save prompts when text areas change
document.addEventListener('input', function(event) {
    if (event.target.id === 'selectionPrompt' || event.target.id === 'pagePrompt') {
        savePrompts();
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

async function savePrompts() {
    try {
        const selectionPrompt = document.getElementById('selectionPrompt').value;
        const pagePrompt = document.getElementById('pagePrompt').value;
        
        await chrome.storage.sync.set({ 
            selectionPrompt: selectionPrompt,
            pagePrompt: pagePrompt
        });
        console.log('Prompts saved:', { selectionPrompt, pagePrompt });
    } catch (error) {
        console.error('Error saving prompts:', error);
    }
}

