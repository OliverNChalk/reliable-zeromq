
        );

        t.is(lOrderLinker.GetPrice(lBuyShadowIds[aIndex]), undefined);
        t.is(lOrderLinker.GetOrderId(aBuyOrder), undefined);
    });
});

test("CompareOrders", (t: any) =>
{

    const lVenueBuyOrders: bigint[] =
    [
        ProximaNumber.ParseToBigInt(8300.61876172),
        ProximaNumber.ParseToBigInt(8234.56),
        ProximaNumber.ParseToBigInt(8200),
        ProximaNumber.ParseToBigInt(8150),
        ProximaNumber.ParseToBigInt(8100),
    ];

    const lVenueSellOrders: bigint[] =
    [
        ProximaNumber.ParseToBigInt(8100),
        ProximaNumber.ParseToBigInt(8150),
        ProximaNumber.ParseToBigInt(8200),
        ProximaNumber.ParseToBigInt(8234.56),
        ProximaNumber.ParseToBigInt(8300.61876172),
    ];

    const lBuyShadowIds: TProximaId[] =
    [
        1n,
        451123n,
        -9819836783n,
        1987167845678345167831468713489761123564567574n,
        -76176817681786187618718725n,
    ];

    const lSellShadowIds: TProximaId[] =
    [
        3n,
        178178n,
        -17828712n,
        191271788718717647659404n,
        -5613426571257819123n,
    ];

    const lOrderLinker: OrderLinker = t.context.ORDER_LINKER;

    // Setup Buy Links
    lVenueBuyOrders.forEach((aBuyOrder: bigint, aIndex: number) =>
    {
        lOrderLinker.NewShadowOrder(lBuyShadowIds[aIndex], aBuyOrder);
    });

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[0], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[0])),
        EOrderComparison.EQUAL,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[1], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[2])),
        EOrderComparison.VENUE_GREATER,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[3], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[1])),
        EOrderComparison.SHADOW_GREATER,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[4], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[4])),
        EOrderComparison.EQUAL,
    );

    // Setup Sell Links
    lVenueSellOrders.forEach((aSellOrder: bigint, aIndex: number) =>
    {
        lOrderLinker.NewShadowOrder(lSellShadowIds[aIndex], aSellOrder);
    });

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[0], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[0])),
        EOrderComparison.EQUAL,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[1], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[2])),
        EOrderComparison.VENUE_GREATER,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[3], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[1])),
        EOrderComparison.SHADOW_GREATER,
    );

    t.is(
        lOrderLinker.CompareOrders(lVenueBuyOrders[4], lCreateOrderDetails(ESide.Buy, lBuyShadowIds[4])),
        EOrderComparison.EQUAL,
    );
});
