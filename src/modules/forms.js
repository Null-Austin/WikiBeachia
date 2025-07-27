// Form configurations loader and utilities
const fs = require('fs');
const path = require('path');

// Load form configurations from JSON file
let formConfigs = {};
try {
  const configPath = path.join(__dirname, 'forms.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  formConfigs = JSON.parse(configData);
} catch (error) {
  console.error('Error loading form configurations:', error);
  formConfigs = {};
}

module.exports = {
  getFormConfig: (formType) => {
    return formConfigs[formType] || null;
  },
  
  getAllFormTypes: () => {
    return Object.keys(formConfigs);
  },
  
  addFormConfig: (formType, config) => {
    formConfigs[formType] = config;
  },
  
  // Additional utility function to reload configurations from file
  reloadFormConfigs: () => {
    try {
      const configPath = path.join(__dirname, 'forms.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      formConfigs = JSON.parse(configData);
      return true;
    } catch (error) {
      console.error('Error reloading form configurations:', error);
      return false;
    }
  },
  
  // Save current configurations back to JSON file
  saveFormConfigs: () => {
    try {
      const configPath = path.join(__dirname, 'forms.json');
      fs.writeFileSync(configPath, JSON.stringify(formConfigs, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving form configurations:', error);
      return false;
    }
  }
};
