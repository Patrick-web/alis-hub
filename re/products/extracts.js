const Product = {
  migrated: ee.Message.getBooleanFieldWithDefault(Mt, 90, !1),
  name: ee.Message.getFieldWithDefault(Mt, 1, ""),
  displayName: ee.Message.getFieldWithDefault(Mt, 2, ""),
  logoUri: ee.Message.getFieldWithDefault(Mt, 26, ""),
  state: ee.Message.getFieldWithDefault(Mt, 3, 0),
  owner: ee.Message.getFieldWithDefault(Mt, 4, ""),
  envList: ee.Message.toObjectList(
    Mt.getEnvList(),
    proto.alis.os.resources.products.v1.Organisation.EnvEntry.toObject,
    bt,
  ),
  domain: ee.Message.getFieldWithDefault(Mt, 6, ""),
  googleProjectId: ee.Message.getFieldWithDefault(Mt, 7, ""),
  updateTime: (Bt = Mt.getUpdateTime()) && ct.Timestamp.toObject(bt, Bt),
  identityUri: ee.Message.getFieldWithDefault(Mt, 9, ""),
  billingAccount: ee.Message.getFieldWithDefault(Mt, 10, ""),
  folder: ee.Message.getFieldWithDefault(Mt, 11, ""),
  googleCustomerId: ee.Message.getFieldWithDefault(Mt, 12, ""),
  version: ee.Message.getFieldWithDefault(Mt, 13, ""),
  expireTime: (Bt = Mt.getExpireTime()) && ct.Timestamp.toObject(bt, Bt),
  ttl: (Bt = Mt.getTtl()) && xe.Duration.toObject(bt, Bt),
  description: ee.Message.getFieldWithDefault(Mt, 16, ""),
  aiEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 17, !1),
  gitProvider: ee.Message.getFieldWithDefault(Mt, 18, 0),
  lbEnabled: ee.Message.getBooleanFieldWithDefault(Mt, 19, !1),
  runHash: ee.Message.getFieldWithDefault(Mt, 20, ""),
  createTime: (Bt = Mt.getCreateTime()) && ct.Timestamp.toObject(bt, Bt),
  managedDnsSwitchoverTime:
    (Bt = Mt.getManagedDnsSwitchoverTime()) && ct.Timestamp.toObject(bt, Bt),
  googleProjectNumber: ee.Message.getFieldWithDefault(Mt, 23, ""),
  managedSpannerDbInstance: ee.Message.getFieldWithDefault(Mt, 24, ""),
  managedSpannerDbConfig:
    (Bt = Mt.getManagedSpannerDbConfig()) &&
    proto.alis.os.resources.products.v1.ManagedSpannerDbConfig.toObject(bt, Bt),
  managedSpannerInstanceConfig:
    (Bt = Mt.getManagedSpannerInstanceConfig()) &&
    proto.alis.os.resources.products.v1.ManagedSpannerInstanceConfig.toObject(
      bt,
      Bt,
    ),
  region: ee.Message.getFieldWithDefault(Mt, 28, ""),
};
