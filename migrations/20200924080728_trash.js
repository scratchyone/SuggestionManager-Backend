exports.up = function (knex) {
  return knex.schema.table('suggestions', function (table) {
    table.boolean('inTrash').notNullable().defaultTo(false);
    table.integer('trashedTimestamp');
  });
};

exports.down = function (knex) {
  return knex.schema.table('suggestions', function (table) {
    table.dropColumn('inTrash');
    table.dropColumn('trashedTimestamp');
  });
};
