exports.up = function (knex) {
  return knex.schema
    .createTable('projects', function (table) {
      table.increments('id').primary();
      table.string('ownerName', 255).notNullable();
      table.string('projectName', 255).notNullable();
      table.integer('lastReadTimestamp').notNullable();
    })
    .createTable('suggestions', function (table) {
      table.increments('id').primary();
      table.integer('projectId').notNullable().references('projects.id');
      table.integer('timestamp').notNullable();
      table.string('displayName', 255).notNullable();
      table.string('suggestionText', 500).notNullable();
    })
    .createTable('tokens', function (table) {
      table.increments('id').primary();
      table.integer('projectId').notNullable().references('projects.id');
      table.string('key', 255).notNullable().unique();
      table.string('permission', 255).notNullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('projects')
    .dropTable('suggestions')
    .dropTable('tokens');
};
