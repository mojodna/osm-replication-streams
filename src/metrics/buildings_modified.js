// Takes changeset, returns count of edited buildings

const test = element =>
  element.type === "way" &&
  element.version > 1 &&
  element.visible &&
  element.tags.building != null;

module.exports = {
  applies: test,
  calculate: elements => elements.filter(test).length
};
