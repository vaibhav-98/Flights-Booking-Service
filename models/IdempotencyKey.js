module.exports = (sequelize, DataTypes) => {
  const IdempotencyKey = sequelize.define("IdempotencyKey", {
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    response: {
      type: DataTypes.JSON, // store last response JSON
      allowNull: true,
    },
  });
  return IdempotencyKey;
};
