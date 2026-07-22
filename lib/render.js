function renderTemplate(templateString, data) {
  return templateString.replace(/{{(\w+)}}/g, (_, key) => (data[key] !== undefined ? data[key] : ''));
}

module.exports = { renderTemplate };
