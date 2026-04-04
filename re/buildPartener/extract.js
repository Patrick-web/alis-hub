const BuildPartener = {
  name: ee.Message.getFieldWithDefault(it, 1, ""),
  displayName: ee.Message.getFieldWithDefault(it, 2, ""),
  websiteUri: ee.Message.getFieldWithDefault(it, 3, ""),
  description: ee.Message.getFieldWithDefault(it, 4, ""),
  logoUri: ee.Message.getFieldWithDefault(it, 5, ""),
  partnerContact:
    (lt = it.getPartnerContact()) &&
    proto.alis.os.accounts.v1.BuildPartner.ContactInfo.toObject(xe, lt),
  generalContact:
    (lt = it.getGeneralContact()) &&
    proto.alis.os.accounts.v1.BuildPartner.ContactInfo.toObject(xe, lt),
  subtitle: ee.Message.getFieldWithDefault(it, 8, ""),
  servicesOfferedList:
    (lt = ee.Message.getRepeatedField(it, 9)) == null ? void 0 : lt,
  specializationsList:
    (lt = ee.Message.getRepeatedField(it, 10)) == null ? void 0 : lt,
  industryFocusesList:
    (lt = ee.Message.getRepeatedField(it, 11)) == null ? void 0 : lt,
  googleCloudPartnership:
    (lt = it.getGoogleCloudPartnership()) &&
    proto.alis.os.accounts.v1.BuildPartner.GoogleCloudPartnership.toObject(
      xe,
      lt,
    ),
  account: ee.Message.getFieldWithDefault(it, 13, ""),
  countryCode: ee.Message.getFieldWithDefault(it, 14, ""),
  createdTime: (lt = it.getCreatedTime()) && ft.Timestamp.toObject(xe, lt),
  updatedTime: (lt = it.getUpdatedTime()) && ft.Timestamp.toObject(xe, lt),
};
