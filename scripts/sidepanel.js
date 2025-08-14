// Side panel JavaScript for AI Help extension

// Load saved service selections and prompts on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const result = await chrome.storage.sync.get(['selectedServices', 'selectionPrompt', 'pagePrompt', 'imagePrompt']);
        const selectedServices = result.selectedServices || ['https://chatgpt.com/'];
        const selectionPrompt = result.selectionPrompt || 'What does this mean: ';
        const pagePrompt = result.pagePrompt || 'Please explain what this webpage is about: ';
        const imagePrompt = result.imagePrompt || 'What do you see in this image?';
        
        // Update checkboxes based on saved selections
        const checkboxes = document.querySelectorAll('input[name="service"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectedServices.includes(checkbox.value);
        });
        
        // Update prompt text areas
        document.getElementById('selectionPrompt').value = selectionPrompt;
        document.getElementById('pagePrompt').value = pagePrompt;
        document.getElementById('imagePrompt').value = imagePrompt;
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
    if (event.target.id === 'selectionPrompt' || event.target.id === 'pagePrompt' || event.target.id === 'imagePrompt') {
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
        const imagePrompt = document.getElementById('imagePrompt').value;
        
        await chrome.storage.sync.set({ 
            selectionPrompt: selectionPrompt,
            pagePrompt: pagePrompt,
            imagePrompt: imagePrompt
        });
        console.log('Prompts saved:', { selectionPrompt, pagePrompt, imagePrompt });
    } catch (error) {
        console.error('Error saving prompts:', error);
    }
}

