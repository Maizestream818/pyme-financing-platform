import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD_HASH = '$2b$10$replaceWithAuthPhaseHashForPassword123';

async function seedRoles() {
  const internalOperator = await prisma.role.upsert({
    where: { name: 'internal_operator' },
    update: {
      description: 'Usuario interno que opera empresas, solicitudes, documentos, riesgo, matching, decisiones y auditoria.',
      isActive: true,
    },
    create: {
      name: 'internal_operator',
      description: 'Usuario interno que opera empresas, solicitudes, documentos, riesgo, matching, decisiones y auditoria.',
      isActive: true,
    },
  });

  const applicant = await prisma.role.upsert({
    where: { name: 'applicant' },
    update: {
      description: 'Solicitante PyME que registra empresa, crea solicitudes, carga documentos y consulta decisiones publicadas.',
      isActive: true,
    },
    create: {
      name: 'applicant',
      description: 'Solicitante PyME que registra empresa, crea solicitudes, carga documentos y consulta decisiones publicadas.',
      isActive: true,
    },
  });

  return { internalOperator, applicant };
}

async function seedUsers(roleIds: { internalOperatorId: string; applicantId: string }) {
  await prisma.user.upsert({
    where: { email: 'operador@demo.com' },
    update: {
      roleId: roleIds.internalOperatorId,
      fullName: 'Operador Demo',
      passwordHash: DEMO_PASSWORD_HASH,
      isActive: true,
    },
    create: {
      roleId: roleIds.internalOperatorId,
      fullName: 'Operador Demo',
      email: 'operador@demo.com',
      passwordHash: DEMO_PASSWORD_HASH,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'applicant@demo.com' },
    update: {
      roleId: roleIds.applicantId,
      fullName: 'Applicant Demo',
      passwordHash: DEMO_PASSWORD_HASH,
      isActive: true,
    },
    create: {
      roleId: roleIds.applicantId,
      fullName: 'Applicant Demo',
      email: 'applicant@demo.com',
      passwordHash: DEMO_PASSWORD_HASH,
      isActive: true,
    },
  });
}

async function seedDocumentRequirements() {
  const requirements = [
    {
      name: 'Identificacion oficial del representante legal',
      description: 'Documento general requerido para identificar al representante legal.',
      isRequired: true,
    },
    {
      name: 'Constancia de Situacion Fiscal / RFC',
      description: 'Documento fiscal general requerido para validar RFC.',
      isRequired: true,
    },
    {
      name: 'Comprobante de domicilio',
      description: 'Documento general requerido para validar domicilio.',
      isRequired: true,
    },
    {
      name: 'Estados de cuenta bancarios',
      description: 'Documento general requerido para evaluar actividad financiera.',
      isRequired: true,
    },
    {
      name: 'Acta constitutiva',
      description: 'Documento requerido para persona moral.',
      isRequired: true,
      appliesToBusinessType: 'persona_moral' as const,
    },
    {
      name: 'Poder del representante legal',
      description: 'Documento requerido para persona moral o cuando exista apoderado.',
      isRequired: true,
      appliesToBusinessType: 'persona_moral' as const,
    },
    {
      name: 'Autorizacion de consulta de Buro de Credito',
      description: 'Documento aplicable cuando se revise historial crediticio.',
      isRequired: true,
    },
    {
      name: 'Declaracion fiscal o estados financieros',
      description: 'Documento aplicable cuando se requiera comprobacion financiera.',
      isRequired: true,
    },
    {
      name: 'Facturas por cobrar',
      description: 'Documento aplicable para solicitudes de factoraje o necesidad de facturas.',
      isRequired: true,
      appliesTo: 'invoices' as const,
    },
    {
      name: 'Cotizacion de maquinaria/equipo',
      description: 'Documento aplicable para solicitudes de equipo, maquinaria o activo.',
      isRequired: true,
      appliesTo: 'equipment' as const,
    },
  ];

  for (const requirement of requirements) {
    await prisma.documentRequirement.upsert({
      where: { name: requirement.name },
      update: {
        description: requirement.description,
        isRequired: requirement.isRequired,
        appliesTo: requirement.appliesTo ?? null,
        appliesToBusinessType: requirement.appliesToBusinessType ?? null,
        isActive: true,
      },
      create: {
        name: requirement.name,
        description: requirement.description,
        isRequired: requirement.isRequired,
        appliesTo: requirement.appliesTo ?? null,
        appliesToBusinessType: requirement.appliesToBusinessType ?? null,
        isActive: true,
      },
    });
  }
}

async function seedFinancialProducts() {
  const products = [
    {
      name: 'Factoraje',
      description: 'Liquidez basada en facturas por cobrar.',
      minAmount: '50000.00',
      maxAmount: '1500000.00',
      minYearsOperating: '1.00',
      maxResponseDays: 5,
      estimatedAnnualRate: '24.00',
      requiresInvoices: true,
      requiresBankStatements: true,
      requiresCollateral: false,
      idealFor: 'invoices' as const,
    },
    {
      name: 'Credito simple',
      description: 'Financiamiento general con plazo definido.',
      minAmount: '50000.00',
      maxAmount: '2000000.00',
      minYearsOperating: '2.00',
      maxResponseDays: 15,
      estimatedAnnualRate: '28.00',
      requiresInvoices: false,
      requiresBankStatements: true,
      requiresCollateral: false,
      idealFor: 'working_capital' as const,
    },
    {
      name: 'Capital de trabajo',
      description: 'Financiamiento para inventario, operacion, proveedores o nomina.',
      minAmount: '30000.00',
      maxAmount: '1000000.00',
      minYearsOperating: '1.00',
      maxResponseDays: 10,
      estimatedAnnualRate: '30.00',
      requiresInvoices: false,
      requiresBankStatements: true,
      requiresCollateral: false,
      idealFor: 'working_capital' as const,
    },
    {
      name: 'Linea revolvente',
      description: 'Linea para necesidades recurrentes de liquidez.',
      minAmount: '100000.00',
      maxAmount: '1500000.00',
      minYearsOperating: '2.00',
      maxResponseDays: 12,
      estimatedAnnualRate: '32.00',
      requiresInvoices: false,
      requiresBankStatements: true,
      requiresCollateral: false,
      idealFor: 'working_capital' as const,
    },
    {
      name: 'Arrendamiento',
      description: 'Financiamiento para maquinaria, equipo o vehiculos.',
      minAmount: '100000.00',
      maxAmount: '2500000.00',
      minYearsOperating: '1.00',
      maxResponseDays: 20,
      estimatedAnnualRate: '26.00',
      requiresInvoices: false,
      requiresBankStatements: true,
      requiresCollateral: true,
      idealFor: 'equipment' as const,
    },
  ];

  const result: Record<string, string> = {};

  for (const product of products) {
    const saved = await prisma.financialProduct.upsert({
      where: { name: product.name },
      update: {
        description: product.description,
        minAmount: product.minAmount,
        maxAmount: product.maxAmount,
        minYearsOperating: product.minYearsOperating,
        maxResponseDays: product.maxResponseDays,
        estimatedAnnualRate: product.estimatedAnnualRate,
        requiresInvoices: product.requiresInvoices,
        requiresBankStatements: product.requiresBankStatements,
        requiresCollateral: product.requiresCollateral,
        idealFor: product.idealFor,
        isActive: true,
      },
      create: {
        name: product.name,
        description: product.description,
        minAmount: product.minAmount,
        maxAmount: product.maxAmount,
        minYearsOperating: product.minYearsOperating,
        maxResponseDays: product.maxResponseDays,
        estimatedAnnualRate: product.estimatedAnnualRate,
        requiresInvoices: product.requiresInvoices,
        requiresBankStatements: product.requiresBankStatements,
        requiresCollateral: product.requiresCollateral,
        idealFor: product.idealFor,
        isActive: true,
      },
    });

    result[product.name] = saved.id;
  }

  return result;
}

async function seedProductRules(productIds: Record<string, string>) {
  await prisma.productRule.deleteMany({
    where: {
      financialProductId: {
        in: Object.values(productIds),
      },
    },
  });

  await prisma.productRule.createMany({
    data: [
      {
        financialProductId: productIds['Factoraje'],
        ruleField: 'need_type',
        operator: 'equals',
        conditionValue: 'invoices',
        scoreWeight: 30,
      },
      {
        financialProductId: productIds['Factoraje'],
        ruleField: 'has_invoices',
        operator: 'equals',
        conditionValue: 'true',
        scoreWeight: 30,
      },
      {
        financialProductId: productIds['Factoraje'],
        ruleField: 'urgency_level',
        operator: 'equals',
        conditionValue: 'high',
        scoreWeight: 20,
      },
      {
        financialProductId: productIds['Arrendamiento'],
        ruleField: 'need_type',
        operator: 'equals',
        conditionValue: 'equipment',
        scoreWeight: 35,
      },
      {
        financialProductId: productIds['Capital de trabajo'],
        ruleField: 'need_type',
        operator: 'equals',
        conditionValue: 'working_capital',
        scoreWeight: 35,
      },
      {
        financialProductId: productIds['Credito simple'],
        ruleField: 'years_operating',
        operator: 'gte',
        conditionValue: '2',
        scoreWeight: 20,
      },
      {
        financialProductId: productIds['Credito simple'],
        ruleField: 'credit_history_status',
        operator: 'equals',
        conditionValue: 'good',
        scoreWeight: 20,
      },
      ...Object.values(productIds).map((financialProductId) => ({
        financialProductId,
        ruleField: 'risk_level' as const,
        operator: 'equals' as const,
        conditionValue: 'high',
        scoreWeight: -25,
      })),
      ...Object.values(productIds).map((financialProductId) => ({
        financialProductId,
        ruleField: 'debt_service_coverage_ratio' as const,
        operator: 'lte' as const,
        conditionValue: '1',
        scoreWeight: -35,
      })),
    ],
  });
}

async function main() {
  const roles = await seedRoles();
  await seedUsers({
    internalOperatorId: roles.internalOperator.id,
    applicantId: roles.applicant.id,
  });
  await seedDocumentRequirements();
  const productIds = await seedFinancialProducts();
  await seedProductRules(productIds);
}

main()
  .catch((error) => {
    console.error(error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
