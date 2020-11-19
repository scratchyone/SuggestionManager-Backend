// run the following command to install:
// npm install objection knex sqlite3
require('dotenv').config();
const { Model } = require('objection');
const Knex = require('knex');
const { v4: uuidv4 } = require('uuid');
// Initialize knex.
const knex = Knex({
  client: 'sqlite3',
  useNullAsDefault: true,
  connection: {
    filename: 'database.db3',
  },
});

// Give the knex instance to objection.
Model.knex(knex);

// Person model.
class Project extends Model {
  static get tableName() {
    return 'projects';
  }

  static get relationMappings() {
    return {
      suggestions: {
        relation: Model.HasManyRelation,
        modelClass: Suggestion,
        join: {
          from: 'projects.id',
          to: 'suggestions.projectId',
        },
      },
      tokens: {
        relation: Model.HasManyRelation,
        modelClass: Token,
        join: {
          from: 'projects.id',
          to: 'tokens.projectId',
        },
      },
    };
  }
}
class Suggestion extends Model {
  static get tableName() {
    return 'suggestions';
  }

  static get relationMappings() {
    return {
      project: {
        relation: Model.BelongsToOneRelation,
        modelClass: Project,
        join: {
          from: 'suggestions.projectId',
          to: 'projects.id',
        },
      },
    };
  }
}
class Token extends Model {
  static get tableName() {
    return 'tokens';
  }
  $beforeInsert() {
    this.key = uuidv4();
  }
  static get relationMappings() {
    return {
      project: {
        relation: Model.BelongsToOneRelation,
        modelClass: Project,
        join: {
          from: 'tokens.projectId',
          to: 'projects.id',
        },
      },
    };
  }
  hasPermission(perm) {
    if (perm == 'VIEW_TOKENS') {
      return this.permission == 'ADMIN';
    }
    if (perm == 'ADD_SUGGESTIONS') {
      return (
        this.permission == 'ADMIN' ||
        this.permission == 'VIEW_SUGGESTIONS' ||
        this.permission == 'ADD_SUGGESTIONS'
      );
    }
    if (perm == 'VIEW_SUGGESTIONS') {
      return (
        this.permission == 'ADMIN' || this.permission == 'VIEW_SUGGESTIONS'
      );
    }
  }
}

var express = require('express');
var { graphqlHTTP } = require('express-graphql');
var { buildSchema } = require('graphql');
const fs = require('fs');
// Construct a schema, using GraphQL schema language
var schema = buildSchema(fs.readFileSync('schema.gql').toString());

// The root provides a resolver function for each API endpoint
var root = {
  project: async ({ key }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    res = res[0];
    let query = Token.query().where('key', key).withGraphFetched('project');
    if (res.hasPermission('VIEW_TOKENS')) {
      query = query.withGraphFetched('project.tokens');
    }
    if (res.hasPermission('VIEW_SUGGESTIONS')) {
      query = query
        .withGraphFetched('project.suggestions')
        .modifyGraph('project.suggestions', (builder) => {
          builder.orderBy('id', 'desc');
        });
    }
    return (await query.first()).project;
  },
  newProject: async ({ ownerName, projectName }) => {
    if (ownerName.length < 3)
      return new Error('Your display name is too short');
    if (ownerName.length > 30)
      return new Error('Your display name is too long');
    if (projectName.length < 3)
      return new Error('Your project name is too short');
    if (projectName.length > 30)
      return new Error('Your project name is too long');
    return await Project.query().insertGraphAndFetch({
      ownerName: ownerName,
      projectName: projectName,
      lastReadTimestamp: Math.round(Date.now() / 1000),
      tokens: [{ permission: 'ADMIN' }, { permission: 'ADD_SUGGESTIONS' }],
    });
  },
  addSuggestion: async ({ displayName, suggestionText, key }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    if (displayName.length < 3)
      return new Error('Your display name is too short');
    if (displayName.length > 30)
      return new Error('Your display name is too long');
    if (suggestionText.length < 3)
      return new Error('Your suggestion is too short');
    if (suggestionText.length > 500)
      return new Error('Your suggestion is too long');
    if (res[0].hasPermission('ADD_SUGGESTIONS')) {
      return await Suggestion.query().insertGraphAndFetch(
        {
          displayName: displayName,
          suggestionText: suggestionText,
          project: { id: res[0].projectId },
          timestamp: Math.round(Date.now() / 1000),
        },
        { relate: true }
      );
    } else {
      return new Error("Key doesn't have permission to do that");
    }
  },
  deleteSuggestion: async ({ id, key }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    if (res[0].hasPermission('VIEW_SUGGESTIONS')) {
      await Suggestion.query()
        .patch({
          inTrash: true,
          trashedTimestamp: Math.round(Date.now() / 1000),
        })
        .where('id', id)
        .where('projectId', res[0].projectId);
      return await Suggestion.query().where('id', id).first();
    } else {
      return new Error("Key doesn't have permission to do that");
    }
  },
  undeleteSuggestion: async ({ id, key }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    if (res[0].hasPermission('VIEW_SUGGESTIONS')) {
      await Suggestion.query()
        .patch({
          inTrash: false,
          trashedTimestamp: null,
        })
        .where('id', id)
        .where('projectId', res[0].projectId);
      return await Suggestion.query().where('id', id).first();
    } else {
      return new Error("Key doesn't have permission to do that");
    }
  },
  refreshLastRead: async ({ key }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    if (res[0].hasPermission('VIEW_SUGGESTIONS')) {
      await Project.query()
        .patch({
          lastReadTimestamp: Math.round(Date.now() / 1000),
        })
        .where('id', res[0].projectId);
      return true;
    } else {
      return new Error("Key doesn't have permission to do that");
    }
  },
  genToken: async ({ key, permission }) => {
    let res = await Token.query().where('key', key);
    if (!res.length) return new Error('Invalid Key');
    if (res[0].hasPermission('VIEW_TOKENS')) {
      return await Token.query().insertGraphAndFetch({
        permission: permission,
        projectId: res[0].projectId,
      });
    } else {
      return new Error('Key must have admin permissions');
    }
  },
};
async function clearOldItems() {
  console.log(
    'Cleared ' +
      (await Suggestion.query()
        .where('trashedTimestamp', '<', (Date.now() - 432000 * 1000) / 1000) // 5 days in the future in unix epoch in seconds
        .delete())
  );
}
setInterval(clearOldItems, 1000 * 60 * 60);
clearOldItems();
var app = express();
var cors = require('cors');
app.use(cors());
app.use(express.json());
app.get('/projects/:id', async (req, res) => {
  let token = await Token.query().where(
    'key',
    (req.headers.authorization &&
      req.headers.authorization.replace('Bearer ', '')) ||
      ''
  );
  if (!token.length) {
    res.status(404).send({ error: 'Invalid Key' });
    return;
  }
  token = token[0];
  if (token.projectId.toString() !== req.params.id) {
    res.status(403).send({ error: 'Invalid Key' });
    return;
  }
  let query = Project.query()
    .where('id', req.params.id)
    .withGraphFetched('suggestions')
    .modifyGraph('suggestions', (builder) => {
      builder.orderBy('id', 'desc');
    })
    .withGraphFetched('tokens');
  const project = await query.first();
  res.send({
    ...(token.hasPermission('ADD_SUGGESTIONS')
      ? {
          id: project.id,
          projectName: project.projectName,
          ownerName: project.ownerName,
        }
      : {}),
    ...(token.hasPermission('VIEW_SUGGESTIONS')
      ? {
          lastReadTimestamp: project.lastReadTimestamp,
          suggestions: project.suggestions,
        }
      : {}),
    ...(token.hasPermission('VIEW_TOKENS')
      ? {
          tokens: project.tokens,
        }
      : {}),
  });
});
app.post('/projects/:id/suggestions', async (req, res) => {
  let token = await Token.query().where(
    'key',
    (req.headers.authorization &&
      req.headers.authorization.replace('Bearer ', '')) ||
      ''
  );
  if (!token.length) {
    res.status(404).send({ error: 'Invalid Key' });
    return;
  }
  token = token[0];
  if (
    token.projectId.toString() !== req.params.id ||
    !token.hasPermission('ADD_SUGGESTIONS')
  ) {
    res.status(403).send({ error: 'Invalid Key' });
    return;
  }
  if (req.body.displayName.length < 3)
    return res.status(400).send({ error: 'Your display name is too short' });
  if (req.body.displayName.length > 30)
    return res.status(400).send({ error: 'Your display name is too long' });
  if (req.body.suggestionText.length < 3)
    return res.status(400).send({ error: 'Your suggestion is too short' });
  if (req.body.suggestionText.length > 500)
    return res.status(400).send({ error: 'Your suggestion is too long' });
  res.send(
    await Suggestion.query().insertGraphAndFetch(
      {
        displayName: req.body.displayName,
        suggestionText: req.body.suggestionText,
        project: { id: req.params.id },
        timestamp: Math.round(Date.now() / 1000),
      },
      { relate: true }
    )
  );
});
app.get('/tokens/:key', async (req, res) => {
  let token = await Token.query().where('key', req.params.key);
  if (!token.length) {
    res.status(404).send({ error: 'Invalid Key' });
    return;
  }
  token = token[0];
  res.send(token);
});
app.use(
  '/graphql',
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);
app.listen(process.env.PORT);
console.log(
  'Running a GraphQL API server at http://localhost:' +
    process.env.PORT +
    '/graphql'
);
