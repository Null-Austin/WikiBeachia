# Flexible Form System Documentation

## Overview
The flexible form system allows you to easily create and customize forms without writing HTML templates for each one. All forms use the same `form.html` template and are configured through JavaScript objects.

## Basic Usage

### 1. Using Predefined Forms
Access predefined forms via the `/form/:formType` route:
- `/form/login` - User login form
- `/form/contact` - Contact form
- `/form/register` - User registration form  
- `/form/settings` - User settings form

### 2. Creating a Custom Form Route
```javascript
app.get('/my-custom-form', (req, res) => {
  const formConfig = {
    title: 'Page Title',
    formTitle: 'Form Heading',
    method: 'POST',
    action: '/api/v1/my-endpoint',
    submitText: 'Submit',
    cancelUrl: '/', // Optional
    fields: [
      // Field definitions here
    ]
  };
  
  renderForm(res, formConfig);
});
```

### 3. Adding New Form Configurations
Add new form configurations to `src/modules/forms.js`:

```javascript
// In forms.js
const formConfigs = {
  'my-new-form': {
    title: 'My New Form',
    formTitle: 'Create Something',
    method: 'POST',
    action: '/api/v1/create-something',
    submitText: 'Create',
    fields: [
      // Field definitions
    ]
  }
};
```

## Field Types

### Text Input
```javascript
{
  name: 'field_name',
  label: 'Field Label',
  type: 'text', // or 'email', 'password', 'url', 'tel', 'number'
  placeholder: 'Placeholder text',
  required: true, // Optional
  helpText: 'Additional help text' // Optional
}
```

### Textarea
```javascript
{
  name: 'description',
  label: 'Description',
  type: 'textarea',
  placeholder: 'Enter description...',
  rows: 8, // Optional, defaults to 5
  required: true
}
```

### Select Dropdown
```javascript
{
  name: 'category',
  label: 'Category',
  type: 'select',
  placeholder: 'Choose a category', // Optional
  required: true,
  options: [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' }
  ]
}
```

### Number Input
```javascript
{
  name: 'age',
  label: 'Age',
  type: 'number',
  min: 18, // Optional
  max: 100, // Optional
  step: 1, // Optional
  required: true
}
```

## Form Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | No | Page title (defaults to 'Form') |
| `formTitle` | string | Yes | Heading displayed on the form |
| `method` | string | No | HTTP method (defaults to 'POST') |
| `action` | string | Yes | Form submission endpoint |
| `submitText` | string | No | Submit button text (defaults to 'Submit') |
| `cancelUrl` | string | No | URL for cancel button (if provided) |
| `fields` | array | Yes | Array of field objects |

## Field Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Field name attribute |
| `label` | string | Yes | Field label text |
| `type` | string | No | Input type (defaults to 'text') |
| `placeholder` | string | No | Placeholder text |
| `required` | boolean | No | Whether field is required |
| `helpText` | string | No | Help text displayed below field |
| `rows` | number | No | Textarea rows (textarea only) |
| `options` | array | No | Options array (select only) |
| `min`, `max`, `step` | number | No | Number input constraints |

## Examples

### Simple Contact Form
```javascript
const contactForm = {
  title: 'Contact Us',
  formTitle: 'Get in Touch',
  action: '/api/v1/contact',
  submitText: 'Send Message',
  fields: [
    {
      name: 'name',
      label: 'Your Name',
      type: 'text',
      required: true
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true
    },
    {
      name: 'message',
      label: 'Message',
      type: 'textarea',
      rows: 6,
      required: true
    }
  ]
};
```

### Registration Form with Validation
```javascript
const registrationForm = {
  title: 'Sign Up',
  formTitle: 'Create Account',
  action: '/api/v1/register',
  submitText: 'Create Account',
  cancelUrl: '/form/login',
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Must be 3-20 characters'
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      helpText: 'Minimum 8 characters'
    }
  ]
};
```

## CSS Styling
The form system uses these CSS classes:
- `.form-container` - Main container
- `.dynamic-form` - Form element
- `.form-group` - Field wrapper
- `.form-help` - Help text
- `.form-actions` - Button container
- `.btn.btn-primary` - Primary button
- `.btn.btn-secondary` - Secondary button

## API Integration
Make sure your API endpoints can handle the form data. The form sends data as `application/x-www-form-urlencoded` by default.

Example API handler:
```javascript
app.post('/api/v1/my-endpoint', (req, res) => {
  const { field1, field2 } = req.body;
  // Process form data
  res.json({ success: true });
});
```
