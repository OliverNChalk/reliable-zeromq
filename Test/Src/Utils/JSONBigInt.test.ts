/* tslint:disable: no-string-literal */
import anyTest, { ExecutionContext } from "ava";
import type { TestInterface } from "ava";
import JSONBigInt from "../../../Src/Utils/JSONBigInt";

type TTestContext =
{
    DummyData: TDummyData[];
    DummyString: string;
};

const test: TestInterface<TTestContext> = anyTest as TestInterface<TTestContext> ;

type TDummyObject =
{
    a: bigint;
    b: string;
    c: bigint[];
};

type TDummyData =
{
    service_id: bigint;
    service_name: string;
    uptime: bigint;
    donations: string;
    ip_address: string;
    currency: string;
    test_array: TDummyObject[];
};

test.before((t: ExecutionContext<TTestContext>): void =>
{
    t.context.DummyData =
    [
      {
        service_id: 1n,
        service_name: "Green, Gottlieb and Huel",
        uptime: 99n,
        donations: "1GvqDK1Sjp6eZmVUVq7fxDxp8CghmPG9rD",
        ip_address: "4.72.61.51",
        currency: "Euro",
        test_array: [
          {
            a: 743671n,
            b: "() => {}",
            c: [23194673219n, 50n, 123n],
          },
          {
            a: 1234512487n,
            b: "myString()",
            c: [23194673219n],
          },
        ],
      },
      {
        service_id: 2n,
        service_name: "Russel-Fritsch",
        uptime: 8n,
        donations: "1PMtLuNNM2k3byMG6ZBJnbGo1eLWsVHq1c",
        ip_address: "122.207.215.79",
        currency: "Euro",
        test_array: [
          {
            a: 1234512487n,
            b: "myString()",
            c: [23194673219n],
          },
        ],
      },
      {
        service_id: 3n,
        service_name: "Goodwin LLC",
        uptime: -49n,
        donations: "1G4f2cb47vjSwzmAStQqrZQRbfvZqzpvoU",
        ip_address: "171.166.74.208",
        currency: "Rupee",
        test_array: [
          {
            a: 743671n,
            b: "() => {}",
            c: [23194673219n],
          },
          {
            a: 1234512487n,
            b: "123451asd2487n",
            c: [23194673219n],
          },
          {
            a: 1234512487n,
            b: "zoo_cage()",
            c: [23194673219n],
          },
        ],
      },
      {
        service_id: 4n,
        service_name: "Deckow LLC",
        uptime: 43393n,
        donations: "17iCaQAmDVkospeAoDxBXK3hE6HyRwbHXw",
        ip_address: "251.236.238.241",
        currency: "Zloty",
        test_array: [
          {
            a: 1234512487n,
            b: "zoo_cage()",
            c: [23194673219n],
          },
        ],
      },
    ];

    t.context.DummyString = "[{\"service_id\":\"1n\",\"service_name\":\"Green, Gottlieb and Huel\",\"uptime\":\"99n\",\"donations\":\"1GvqDK1Sjp6eZmVUVq7fxDxp8CghmPG9rD\",\"ip_address\":\"4.72.61.51\",\"currency\":\"Euro\",\"test_array\":[{\"a\":\"743671n\",\"b\":\"() => {}\",\"c\":[\"23194673219n\",\"50n\",\"123n\"]},{\"a\":\"1234512487n\",\"b\":\"myString()\",\"c\":[\"23194673219n\"]}]},{\"service_id\":\"2n\",\"service_name\":\"Russel-Fritsch\",\"uptime\":\"8n\",\"donations\":\"1PMtLuNNM2k3byMG6ZBJnbGo1eLWsVHq1c\",\"ip_address\":\"122.207.215.79\",\"currency\":\"Euro\",\"test_array\":[{\"a\":\"1234512487n\",\"b\":\"myString()\",\"c\":[\"23194673219n\"]}]},{\"service_id\":\"3n\",\"service_name\":\"Goodwin LLC\",\"uptime\":\"-49n\",\"donations\":\"1G4f2cb47vjSwzmAStQqrZQRbfvZqzpvoU\",\"ip_address\":\"171.166.74.208\",\"currency\":\"Rupee\",\"test_array\":[{\"a\":\"743671n\",\"b\":\"() => {}\",\"c\":[\"23194673219n\"]},{\"a\":\"1234512487n\",\"b\":\"123451asd2487n\",\"c\":[\"23194673219n\"]},{\"a\":\"1234512487n\",\"b\":\"zoo_cage()\",\"c\":[\"23194673219n\"]}]},{\"service_id\":\"4n\",\"service_name\":\"Deckow LLC\",\"uptime\":\"43393n\",\"donations\":\"17iCaQAmDVkospeAoDxBXK3hE6HyRwbHXw\",\"ip_address\":\"251.236.238.241\",\"currency\":\"Zloty\",\"test_array\":[{\"a\":\"1234512487n\",\"b\":\"zoo_cage()\",\"c\":[\"23194673219n\"]}]}]";
});

test("Stringify", (t: ExecutionContext<TTestContext>): void =>
{
    const lObjectWithBigInt: TDummyData[] = t.context.DummyData;
    const lTargetObject: string = t.context.DummyString;

    const lStringifiedObject: string = JSONBigInt.Stringify(lObjectWithBigInt);

    t.is(lStringifiedObject, lTargetObject);
});

test("Parse", (t: ExecutionContext<TTestContext>): void =>
{
    t.is(JSONBigInt.Stringify(5n), "\"5n\"");
    t.is(JSONBigInt.Parse("\"5n\""), 5n);
    t.is(JSONBigInt.Stringify(-21n), "\"-21n\"");
    t.is(JSONBigInt.Parse("\"-21n\""), -21n);

    t.is(JSONBigInt.Parse("\"-21an\""), "-21an");
    t.is(JSONBigInt.Parse("\"2137646512-634n\""), "2137646512-634n");
    t.is(JSONBigInt.Parse("\"76854678n%\""), "76854678n%");
    t.is(JSONBigInt.Parse("\"768[]54678n\""), "768[]54678n");

    const lStartingString: string = t.context.DummyString;
    const lTargetObject: TDummyData[] = t.context.DummyData;
    const lParsedObject: TDummyData[] = JSONBigInt.Parse(lStartingString);

    t.deepEqual(lParsedObject, lTargetObject);

    const lStartingStringWithNegative: string = `{ "data": "-1n", "another_data":{"positive":"1n", "negative":"-1n"}}`;
    const lExpected: {data: bigint; another_data: { positive: bigint; negative: bigint }} =
    {
        data: -1n,
        another_data:
        {
            positive: 1n,
            negative: -1n,
        },
    };
    t.deepEqual(JSONBigInt.Parse(lStartingStringWithNegative), lExpected);
});

test("Stringify & Parse", (t: ExecutionContext<TTestContext>): void =>
{
    const lTargetObject: TDummyData[] = t.context.DummyData;
    const lStringified: string = JSONBigInt.Stringify(t.context.DummyData);
    const lParsed: TDummyData[] = JSONBigInt.Parse(lStringified);

    t.deepEqual(lParsed, lTargetObject);
    t.deepEqual(lStringified, t.context.DummyString);

    function StringifyThenParse(aInput: any): any
    {
        return JSONBigInt.Parse(JSONBigInt.Stringify(aInput));
    }

    t.is(StringifyThenParse(undefined), undefined);
    t.is(StringifyThenParse(null), null);
    t.is(StringifyThenParse(void(0)), void(0));
    t.deepEqual(StringifyThenParse({}), {});
    t.is(StringifyThenParse(""), "");
    t.is(StringifyThenParse(0n), 0n);
    t.is(StringifyThenParse(-1n), -1n);
});
