function requireIam_pb$1() {
  return (
    hasRequiredIam_pb$1 ||
      ((hasRequiredIam_pb$1 = 1),
      (function (ne) {
        var ee = requireGoogleProtobuf$1(),
          te = ee,
          vt = globalThis;
        (te.exportSymbol(
          "proto.alis.open.iam.v1.AddIamBindingsRequest",
          null,
          vt,
        ),
          te.exportSymbol(
            "proto.alis.open.iam.v1.BatchTestIamPermissionsRequest",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.open.iam.v1.BatchTestIamPermissionsResponse",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions",
            null,
            vt,
          ),
          te.exportSymbol(
            "proto.alis.open.iam.v1.RemoveIamBindingsRequest",
            null,
            vt,
          ),
          (proto.alis.open.iam.v1.AddIamBindingsRequest = function (gt) {
            ee.Message.initialize(
              this,
              gt,
              0,
              -1,
              proto.alis.open.iam.v1.AddIamBindingsRequest.repeatedFields_,
              null,
            );
          }),
          te.inherits(proto.alis.open.iam.v1.AddIamBindingsRequest, ee.Message),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.open.iam.v1.AddIamBindingsRequest.displayName =
              "proto.alis.open.iam.v1.AddIamBindingsRequest"),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest = function (gt) {
            ee.Message.initialize(
              this,
              gt,
              0,
              -1,
              proto.alis.open.iam.v1.RemoveIamBindingsRequest.repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.open.iam.v1.RemoveIamBindingsRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.open.iam.v1.RemoveIamBindingsRequest.displayName =
              "proto.alis.open.iam.v1.RemoveIamBindingsRequest"),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest = function (
            gt,
          ) {
            ee.Message.initialize(
              this,
              gt,
              0,
              -1,
              proto.alis.open.iam.v1.BatchTestIamPermissionsRequest
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.open.iam.v1.BatchTestIamPermissionsRequest,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.displayName =
              "proto.alis.open.iam.v1.BatchTestIamPermissionsRequest"),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse = function (
            gt,
          ) {
            ee.Message.initialize(
              this,
              gt,
              0,
              -1,
              proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                .repeatedFields_,
              null,
            );
          }),
          te.inherits(
            proto.alis.open.iam.v1.BatchTestIamPermissionsResponse,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.displayName =
              "proto.alis.open.iam.v1.BatchTestIamPermissionsResponse"),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions =
            function (gt) {
              ee.Message.initialize(
                this,
                gt,
                0,
                -1,
                proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                  .ResourcePermissions.repeatedFields_,
                null,
              );
            }),
          te.inherits(
            proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
              .ResourcePermissions,
            ee.Message,
          ),
          te.DEBUG &&
            !COMPILED &&
            (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.displayName =
              "proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions"),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.repeatedFields_ = [
            2, 3,
          ]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.toObject =
              function (gt) {
                return proto.alis.open.iam.v1.AddIamBindingsRequest.toObject(
                  gt,
                  this,
                );
              }),
            (proto.alis.open.iam.v1.AddIamBindingsRequest.toObject = function (
              gt,
              ht,
            ) {
              var pt,
                Rt = {
                  resource: ee.Message.getFieldWithDefault(ht, 1, ""),
                  principalsList:
                    (pt = ee.Message.getRepeatedField(ht, 2)) == null
                      ? void 0
                      : pt,
                  rolesList:
                    (pt = ee.Message.getRepeatedField(ht, 3)) == null
                      ? void 0
                      : pt,
                  removeFromOtherRoles: ee.Message.getBooleanFieldWithDefault(
                    ht,
                    4,
                    !1,
                  ),
                };
              return (gt && (Rt.$jspbMessageInstance = ht), Rt);
            })),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.deserializeBinary =
            function (gt) {
              var ht = new ee.BinaryReader(gt),
                pt = new proto.alis.open.iam.v1.AddIamBindingsRequest();
              return proto.alis.open.iam.v1.AddIamBindingsRequest.deserializeBinaryFromReader(
                pt,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.deserializeBinaryFromReader =
            function (gt, ht) {
              for (; ht.nextField() && !ht.isEndGroup(); ) {
                var pt = ht.getFieldNumber();
                switch (pt) {
                  case 1:
                    var Rt = ht.readStringRequireUtf8();
                    gt.setResource(Rt);
                    break;
                  case 2:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addPrincipals(Rt);
                    break;
                  case 3:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addRoles(Rt);
                    break;
                  case 4:
                    var Rt = ht.readBool();
                    gt.setRemoveFromOtherRoles(Rt);
                    break;
                  default:
                    ht.skipField();
                    break;
                }
              }
              return gt;
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.serializeBinary =
            function () {
              var gt = new ee.BinaryWriter();
              return (
                proto.alis.open.iam.v1.AddIamBindingsRequest.serializeBinaryToWriter(
                  this,
                  gt,
                ),
                gt.getResultBuffer()
              );
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.serializeBinaryToWriter =
            function (gt, ht) {
              var pt = void 0;
              ((pt = gt.getResource()),
                pt.length > 0 && ht.writeString(1, pt),
                (pt = gt.getPrincipalsList()),
                pt.length > 0 && ht.writeRepeatedString(2, pt),
                (pt = gt.getRolesList()),
                pt.length > 0 && ht.writeRepeatedString(3, pt),
                (pt = gt.getRemoveFromOtherRoles()),
                pt && ht.writeBool(4, pt));
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.getResource =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.setResource =
            function (gt) {
              return ee.Message.setProto3StringField(this, 1, gt);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.getPrincipalsList =
            function () {
              return ee.Message.getRepeatedField(this, 2);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.setPrincipalsList =
            function (gt) {
              return ee.Message.setField(this, 2, gt || []);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.addPrincipals =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 2, gt, ht);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.clearPrincipalsList =
            function () {
              return this.setPrincipalsList([]);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.getRolesList =
            function () {
              return ee.Message.getRepeatedField(this, 3);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.setRolesList =
            function (gt) {
              return ee.Message.setField(this, 3, gt || []);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.addRoles =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 3, gt, ht);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.clearRolesList =
            function () {
              return this.setRolesList([]);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.getRemoveFromOtherRoles =
            function () {
              return ee.Message.getBooleanFieldWithDefault(this, 4, !1);
            }),
          (proto.alis.open.iam.v1.AddIamBindingsRequest.prototype.setRemoveFromOtherRoles =
            function (gt) {
              return ee.Message.setProto3BooleanField(this, 4, gt);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.repeatedFields_ = [
            2, 3,
          ]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.toObject =
              function (gt) {
                return proto.alis.open.iam.v1.RemoveIamBindingsRequest.toObject(
                  gt,
                  this,
                );
              }),
            (proto.alis.open.iam.v1.RemoveIamBindingsRequest.toObject =
              function (gt, ht) {
                var pt,
                  Rt = {
                    resource: ee.Message.getFieldWithDefault(ht, 1, ""),
                    principalsList:
                      (pt = ee.Message.getRepeatedField(ht, 2)) == null
                        ? void 0
                        : pt,
                    rolesList:
                      (pt = ee.Message.getRepeatedField(ht, 3)) == null
                        ? void 0
                        : pt,
                  };
                return (gt && (Rt.$jspbMessageInstance = ht), Rt);
              })),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.deserializeBinary =
            function (gt) {
              var ht = new ee.BinaryReader(gt),
                pt = new proto.alis.open.iam.v1.RemoveIamBindingsRequest();
              return proto.alis.open.iam.v1.RemoveIamBindingsRequest.deserializeBinaryFromReader(
                pt,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.deserializeBinaryFromReader =
            function (gt, ht) {
              for (; ht.nextField() && !ht.isEndGroup(); ) {
                var pt = ht.getFieldNumber();
                switch (pt) {
                  case 1:
                    var Rt = ht.readStringRequireUtf8();
                    gt.setResource(Rt);
                    break;
                  case 2:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addPrincipals(Rt);
                    break;
                  case 3:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addRoles(Rt);
                    break;
                  default:
                    ht.skipField();
                    break;
                }
              }
              return gt;
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.serializeBinary =
            function () {
              var gt = new ee.BinaryWriter();
              return (
                proto.alis.open.iam.v1.RemoveIamBindingsRequest.serializeBinaryToWriter(
                  this,
                  gt,
                ),
                gt.getResultBuffer()
              );
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.serializeBinaryToWriter =
            function (gt, ht) {
              var pt = void 0;
              ((pt = gt.getResource()),
                pt.length > 0 && ht.writeString(1, pt),
                (pt = gt.getPrincipalsList()),
                pt.length > 0 && ht.writeRepeatedString(2, pt),
                (pt = gt.getRolesList()),
                pt.length > 0 && ht.writeRepeatedString(3, pt));
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.getResource =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.setResource =
            function (gt) {
              return ee.Message.setProto3StringField(this, 1, gt);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.getPrincipalsList =
            function () {
              return ee.Message.getRepeatedField(this, 2);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.setPrincipalsList =
            function (gt) {
              return ee.Message.setField(this, 2, gt || []);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.addPrincipals =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 2, gt, ht);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.clearPrincipalsList =
            function () {
              return this.setPrincipalsList([]);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.getRolesList =
            function () {
              return ee.Message.getRepeatedField(this, 3);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.setRolesList =
            function (gt) {
              return ee.Message.setField(this, 3, gt || []);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.addRoles =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 3, gt, ht);
            }),
          (proto.alis.open.iam.v1.RemoveIamBindingsRequest.prototype.clearRolesList =
            function () {
              return this.setRolesList([]);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.repeatedFields_ =
            [1, 2]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.toObject =
              function (gt) {
                return proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.toObject(
                  gt,
                  this,
                );
              }),
            (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.toObject =
              function (gt, ht) {
                var pt,
                  Rt = {
                    resourcesList:
                      (pt = ee.Message.getRepeatedField(ht, 1)) == null
                        ? void 0
                        : pt,
                    permissionsList:
                      (pt = ee.Message.getRepeatedField(ht, 2)) == null
                        ? void 0
                        : pt,
                  };
                return (gt && (Rt.$jspbMessageInstance = ht), Rt);
              })),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.deserializeBinary =
            function (gt) {
              var ht = new ee.BinaryReader(gt),
                pt =
                  new proto.alis.open.iam.v1.BatchTestIamPermissionsRequest();
              return proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.deserializeBinaryFromReader(
                pt,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.deserializeBinaryFromReader =
            function (gt, ht) {
              for (; ht.nextField() && !ht.isEndGroup(); ) {
                var pt = ht.getFieldNumber();
                switch (pt) {
                  case 1:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addResources(Rt);
                    break;
                  case 2:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addPermissions(Rt);
                    break;
                  default:
                    ht.skipField();
                    break;
                }
              }
              return gt;
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.serializeBinary =
            function () {
              var gt = new ee.BinaryWriter();
              return (
                proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.serializeBinaryToWriter(
                  this,
                  gt,
                ),
                gt.getResultBuffer()
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.serializeBinaryToWriter =
            function (gt, ht) {
              var pt = void 0;
              ((pt = gt.getResourcesList()),
                pt.length > 0 && ht.writeRepeatedString(1, pt),
                (pt = gt.getPermissionsList()),
                pt.length > 0 && ht.writeRepeatedString(2, pt));
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.getResourcesList =
            function () {
              return ee.Message.getRepeatedField(this, 1);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.setResourcesList =
            function (gt) {
              return ee.Message.setField(this, 1, gt || []);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.addResources =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 1, gt, ht);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.clearResourcesList =
            function () {
              return this.setResourcesList([]);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.getPermissionsList =
            function () {
              return ee.Message.getRepeatedField(this, 2);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.setPermissionsList =
            function (gt) {
              return ee.Message.setField(this, 2, gt || []);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.addPermissions =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 2, gt, ht);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsRequest.prototype.clearPermissionsList =
            function () {
              return this.setPermissionsList([]);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.repeatedFields_ =
            [1]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.toObject =
              function (gt) {
                return proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.toObject(
                  gt,
                  this,
                );
              }),
            (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.toObject =
              function (gt, ht) {
                var pt = {
                  resourcePermissionsList: ee.Message.toObjectList(
                    ht.getResourcePermissionsList(),
                    proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                      .ResourcePermissions.toObject,
                    gt,
                  ),
                };
                return (gt && (pt.$jspbMessageInstance = ht), pt);
              })),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.deserializeBinary =
            function (gt) {
              var ht = new ee.BinaryReader(gt),
                pt =
                  new proto.alis.open.iam.v1.BatchTestIamPermissionsResponse();
              return proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.deserializeBinaryFromReader(
                pt,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.deserializeBinaryFromReader =
            function (gt, ht) {
              for (; ht.nextField() && !ht.isEndGroup(); ) {
                var pt = ht.getFieldNumber();
                if (pt === 1) {
                  var Rt =
                    new proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions();
                  (ht.readMessage(
                    Rt,
                    proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                      .ResourcePermissions.deserializeBinaryFromReader,
                  ),
                    gt.addResourcePermissions(Rt));
                } else ht.skipField();
              }
              return gt;
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.serializeBinary =
            function () {
              var gt = new ee.BinaryWriter();
              return (
                proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.serializeBinaryToWriter(
                  this,
                  gt,
                ),
                gt.getResultBuffer()
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.serializeBinaryToWriter =
            function (gt, ht) {
              var pt = void 0;
              ((pt = gt.getResourcePermissionsList()),
                pt.length > 0 &&
                  ht.writeRepeatedMessage(
                    1,
                    pt,
                    proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                      .ResourcePermissions.serializeBinaryToWriter,
                  ));
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.repeatedFields_ =
            [2]),
          ee.Message.GENERATE_TO_OBJECT &&
            ((proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.toObject =
              function (gt) {
                return proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.toObject(
                  gt,
                  this,
                );
              }),
            (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.toObject =
              function (gt, ht) {
                var pt,
                  Rt = {
                    resource: ee.Message.getFieldWithDefault(ht, 1, ""),
                    permissionsList:
                      (pt = ee.Message.getRepeatedField(ht, 2)) == null
                        ? void 0
                        : pt,
                  };
                return (gt && (Rt.$jspbMessageInstance = ht), Rt);
              })),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.deserializeBinary =
            function (gt) {
              var ht = new ee.BinaryReader(gt),
                pt =
                  new proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions();
              return proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.deserializeBinaryFromReader(
                pt,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.deserializeBinaryFromReader =
            function (gt, ht) {
              for (; ht.nextField() && !ht.isEndGroup(); ) {
                var pt = ht.getFieldNumber();
                switch (pt) {
                  case 1:
                    var Rt = ht.readStringRequireUtf8();
                    gt.setResource(Rt);
                    break;
                  case 2:
                    var Rt = ht.readStringRequireUtf8();
                    gt.addPermissions(Rt);
                    break;
                  default:
                    ht.skipField();
                    break;
                }
              }
              return gt;
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.serializeBinary =
            function () {
              var gt = new ee.BinaryWriter();
              return (
                proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.serializeBinaryToWriter(
                  this,
                  gt,
                ),
                gt.getResultBuffer()
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.serializeBinaryToWriter =
            function (gt, ht) {
              var pt = void 0;
              ((pt = gt.getResource()),
                pt.length > 0 && ht.writeString(1, pt),
                (pt = gt.getPermissionsList()),
                pt.length > 0 && ht.writeRepeatedString(2, pt));
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.getResource =
            function () {
              return ee.Message.getFieldWithDefault(this, 1, "");
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.setResource =
            function (gt) {
              return ee.Message.setProto3StringField(this, 1, gt);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.getPermissionsList =
            function () {
              return ee.Message.getRepeatedField(this, 2);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.setPermissionsList =
            function (gt) {
              return ee.Message.setField(this, 2, gt || []);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.addPermissions =
            function (gt, ht) {
              return ee.Message.addToRepeatedField(this, 2, gt, ht);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.ResourcePermissions.prototype.clearPermissionsList =
            function () {
              return this.setPermissionsList([]);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.getResourcePermissionsList =
            function () {
              return ee.Message.getRepeatedWrapperField(
                this,
                proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                  .ResourcePermissions,
                1,
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.setResourcePermissionsList =
            function (gt) {
              return ee.Message.setRepeatedWrapperField(this, 1, gt);
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.addResourcePermissions =
            function (gt, ht) {
              return ee.Message.addToRepeatedWrapperField(
                this,
                1,
                gt,
                proto.alis.open.iam.v1.BatchTestIamPermissionsResponse
                  .ResourcePermissions,
                ht,
              );
            }),
          (proto.alis.open.iam.v1.BatchTestIamPermissionsResponse.prototype.clearResourcePermissionsList =
            function () {
              return this.setResourcePermissionsList([]);
            }),
          te.object.extend(ne, proto.alis.open.iam.v1));
      })(iam_pb$1)),
    iam_pb$1
  );
}
