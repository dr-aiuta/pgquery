interface HandleSQLQueryBy {
    jsonField: (aliasPrefix: string, field: string, value: object, whereConditions: string[], queryValues: any[]) => void;
    dateField: (aliasPrefix: string, field: string, condition: string, value: any, whereConditions: string[], queryValues: any[]) => void;
    orderByField: (aliasPrefix: string, field: string, value: any, orderByParts: string[]) => void;
    likeField: (aliasPrefix: string, field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
    inField: (aliasPrefix: string, field: string, value: any, whereConditions: string[], queryValues: any[]) => void;
    defaultField: (aliasPrefix: string, field: string, condition: string, value: any, whereConditions: string[], queryValues: any[]) => void;
}
declare const handleSQLQueryBy: HandleSQLQueryBy;
export default handleSQLQueryBy;
//# sourceMappingURL=utils.d.ts.map