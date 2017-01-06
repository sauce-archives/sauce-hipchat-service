var _ = require('lodash');
var Sequelize = require("sequelize");

var connectionPromise;

function getAsObject(val) {
  if (val) {
    try {
      if (Buffer.isBuffer(val)) {
        val = val.toString();
      } else if (typeof val === 'object') {
        val = val.get("val");
      }
      val = JSON.parse(val);
    } catch (e) {
      console.trace('val', val);
      console.error("Could not parse val", e);
    }
  }

  return val;
}

function SequelizeAdapter(logger, opts) {
  var sequelizeSettings = Object.assign({ logging: logger.info }, opts.settings);
  var sequelize = new Sequelize(sequelizeSettings);

  var AddonSettings = sequelize.define('AddonSetting', {
    clientKey: {
      type: Sequelize.STRING,
      allowNull: true
    },
    key: {
      type: Sequelize.STRING,
      allowNull: true
    },
    val: {
      type: Sequelize.BLOB,
      allowNull: true
    }
  }, {
    indexes: [{
      fields: ["clientKey", "key"]
    }]
  });

  connectionPromise = new Promise(function(resolve, reject) {
    return AddonSettings.sync().then(resolve, reject);
  });

  _.bindAll(this, 'get', 'set', 'del');
}

var proto = SequelizeAdapter.prototype;

proto.isMemoryStore = function () {
  return false;
};

// run a query with an arbitrary 'where' clause
// returns an array of values
proto._get = function (where) {
  return connectionPromise.then(function(AddonSettings) {
    return AddonSettings.findAll({ where: where })
      .then(function(results) {
        return _.map(results, getAsObject);
      });
  });
};

proto.getAllClientInfos = function () {
  return this._get({key:'clientInfo'});
};

// return a promise to a single object identified by 'key' in the data belonging to tenant 'clientKey'
proto.get = function (key, clientKey) {
  return connectionPromise.then(function(AddonSettings) {
    return AddonSettings.findOne({
      where: {
        key: key,
        clientKey: clientKey
      }
    }).then(getAsObject);
  });
};

proto.set = function (key, value, clientKey) {
  return connectionPromise.then(function(AddonSettings) {
    value = JSON.stringify(value);
    return AddonSettings.findOrCreate({
      where: { key: key, clientKey: clientKey },
      defaults: { val: value }
    }).spread(function (result, created) {
      if (!created) {
        return result.update({ val: value }).then(getAsObject)
      } else {
        return getAsObject(result.get("val"));
      }
    })
  });
};

proto.del = function (key, clientKey) {
  var whereClause;
  if (arguments.length < 2) {
    whereClause = {
      clientKey: key
    };
  } else {
    whereClause = {
      key: key,
      clientKey: clientKey
    };
  }

  return connectionPromise.then(function(AddonSettings) {
    return AddonSettings.destroy({ where: whereClause })
  });
};

module.exports = function (logger, opts) {
  if (0 == arguments.length) {
    return SequelizeAdapter;
  }
  return new SequelizeAdapter(logger, opts);
};



