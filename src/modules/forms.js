// Form configurations for the flexible form system
const formConfigs = {
  'create-post': {
    title: 'Create New Post',
    formTitle: 'Create New Post',
    method: 'POST',
    action: '/api/v1/create-page',
    submitText: 'Create Post',
    fields: [
      {
        name: 'display_name',
        label: 'Display Title',
        type: 'text',
        placeholder: 'Title',
        required: true
      },
      {
        name: 'content',
        label: 'Content',
        type: 'textarea',
        placeholder: 'Content',
        rows: 12,
        required: true
      }
    ]
  },
  
  'login': {
    title: 'Login',
    formTitle: 'Login to Your Account',
    method: 'POST',
    action: '/api/v1/login',
    submitText: 'Login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Enter your username',
        required: true
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
        required: true
      }
    ]
  },
  'register': {
    title: 'Register',
    formTitle: 'Create New Account',
    method: 'POST',
    action: '/api/v1/register',
    submitText: 'Create Account',
    cancelUrl: '/form/login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Choose a username',
        required: true,
        helpText: 'Must be 3-20 characters long'
      },
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'your.email@example.com',
        required: true
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Choose a strong password',
        required: true,
        helpText: 'Must be at least 8 characters long'
      },
      {
        name: 'confirm_password',
        label: 'Confirm Password',
        type: 'password',
        placeholder: 'Re-enter your password',
        required: true
      }
    ]
  },
};

module.exports = {
  getFormConfig: (formType) => {
    return formConfigs[formType] || null;
  },
  
  getAllFormTypes: () => {
    return Object.keys(formConfigs);
  },
  
  addFormConfig: (formType, config) => {
    formConfigs[formType] = config;
  }
};
