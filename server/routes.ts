import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { webinarRegistrationSchema, courseInquirySchema } from "@shared/schema";
import { ZodError } from "zod";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Funzione di utilità per ottenere prodotti esistenti (senza crearne di nuovi)
async function getStripeProducts() {
  try {
    console.log("Recupero prodotti Stripe esistenti...");
    
    // Smart Revolution Sprint: Recupera il primo prodotto attivo
    const smartRevolutionProducts = await stripe.products.list({
      active: true,
      limit: 100
    });
    
    let smartRevolutionProduct = null;
    for (const product of smartRevolutionProducts.data) {
      if (product.name.includes("Smart Revolution Sprint")) {
        smartRevolutionProduct = product;
        console.log("Prodotto Smart Revolution Sprint trovato:", product.id);
        break;
      }
    }
    
    if (!smartRevolutionProduct) {
      throw new Error("Prodotto Smart Revolution Sprint non trovato in Stripe");
    }
    
    // Recupera il prezzo del prodotto workshop
    const smartRevolutionPrices = await stripe.prices.list({
      product: smartRevolutionProduct.id,
      active: true,
    });
    
    if (smartRevolutionPrices.data.length === 0) {
      throw new Error("Nessun prezzo attivo trovato per Smart Revolution Sprint");
    }
    
    const smartRevolutionPrice = smartRevolutionPrices.data[0];
    console.log("Prezzo Smart Revolution Sprint:", smartRevolutionPrice.id);
    
    // Percorso Formativo in Sviluppo Personale: Recupera il primo prodotto attivo
    const formativoProducts = await stripe.products.list({
      active: true,
      limit: 100
    });
    
    let sviluppoPersonaleProduct = null;
    for (const product of formativoProducts.data) {
      if (product.name.includes("Percorso Formativo")) {
        sviluppoPersonaleProduct = product;
        console.log("Prodotto Percorso Formativo trovato:", product.id);
        break;
      }
    }
    
    if (!sviluppoPersonaleProduct) {
      throw new Error("Prodotto Percorso Formativo non trovato in Stripe");
    }
    
    // Recupera il prezzo del prodotto corso
    const sviluppoPersonalePrices = await stripe.prices.list({
      product: sviluppoPersonaleProduct.id,
      active: true,
    });
    
    if (sviluppoPersonalePrices.data.length === 0) {
      throw new Error("Nessun prezzo attivo trovato per Percorso Formativo");
    }
    
    const sviluppoPersonalePrice = sviluppoPersonalePrices.data[0];
    console.log("Prezzo Percorso Formativo:", sviluppoPersonalePrice.id);
    
    return {
      smartRevolution: { product: smartRevolutionProduct, price: smartRevolutionPrice },
      sviluppoPersonale: { product: sviluppoPersonaleProduct, price: sviluppoPersonalePrice }
    };
  } catch (error) {
    console.error("Errore durante il recupero dei prodotti Stripe:", error);
    throw error;
  }
}

// Funzione per aggiornare i prodotti Stripe
async function updateStripePrices() {
  try {
    const products = await getStripeProducts();
    
    // Aggiorna il prezzo del corso formativo se è impostato a €4000 invece che €3998
    if (products.sviluppoPersonale.price.unit_amount === 400000) {
      console.log("Aggiornamento prezzo per il Percorso Formativo da €4000 a €3998...");
      
      // Archivio il vecchio prezzo
      await stripe.prices.update(products.sviluppoPersonale.price.id, {
        active: false
      });
      
      // Creo un nuovo prezzo
      const newPrice = await stripe.prices.create({
        product: products.sviluppoPersonale.product.id,
        unit_amount: 399800, // €3998.00
        currency: 'eur',
        metadata: {
          original_price: "7998"
        }
      });
      
      console.log("Nuovo prezzo creato:", newPrice.id);
      return true;
    } else {
      console.log("Il prezzo del Percorso Formativo è già corretto");
      return false;
    }
  } catch (error) {
    console.error("Errore nell'aggiornamento dei prezzi Stripe:", error);
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Inizializza i prodotti Stripe
  try {
    await getStripeProducts();
    
    // Aggiorna i prezzi se necessario
    const updated = await updateStripePrices();
    if (updated) {
      console.log("Prezzi Stripe aggiornati con successo!");
    }
  } catch (error) {
    console.error("Errore inizializzazione Stripe:", error);
  }
  // API route for webinar registrations
  app.post("/api/webinar/register", async (req, res) => {
    try {
      // Validate the request body
      const registrationData = webinarRegistrationSchema.parse(req.body);
      
      // Store the registration
      const registration = await storage.createWebinarRegistration({
        ...registrationData,
        registeredAt: new Date().toISOString(),
      });

      return res.status(201).json({
        success: true,
        message: "Registration successful",
        data: registration
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors
        });
      }

      return res.status(500).json({
        success: false,
        message: "An error occurred while processing your registration"
      });
    }
  });

  // Get all webinar registrations (admin only, in a real app you'd add auth middleware)
  app.get("/api/webinar/registrations", async (_req, res) => {
    try {
      const registrations = await storage.getAllWebinarRegistrations();
      return res.status(200).json({
        success: true,
        data: registrations
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "An error occurred while fetching registrations"
      });
    }
  });

  // API route for course inquiries
  app.post("/api/course/inquiry", async (req, res) => {
    try {
      // Validate the request body
      const inquiryData = courseInquirySchema.parse(req.body);
      
      // Store the inquiry
      const inquiry = await storage.createCourseInquiry({
        ...inquiryData,
        inquiryDate: new Date().toISOString(),
      });

      return res.status(201).json({
        success: true,
        message: "Richiesta di informazioni inviata con successo",
        data: inquiry
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Errore di validazione",
          errors: error.errors
        });
      }

      console.error("Course inquiry error:", error);

      return res.status(500).json({
        success: false,
        message: "Si è verificato un errore durante l'elaborazione della tua richiesta"
      });
    }
  });

  // Get all course inquiries (admin only, in a real app you'd add auth middleware)
  app.get("/api/course/inquiries", async (_req, res) => {
    try {
      const inquiries = await storage.getAllCourseInquiries();
      return res.status(200).json({
        success: true,
        data: inquiries
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "An error occurred while fetching course inquiries"
      });
    }
  });

  // Endpoint per ottenere prodotti e prezzi da Stripe
  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const products = await getStripeProducts();
      return res.status(200).json({
        success: true,
        data: {
          smartRevolution: {
            productId: products.smartRevolution.product.id,
            priceId: products.smartRevolution.price.id,
            amount: (products.smartRevolution.price.unit_amount || 3700) / 100, // Converti da centesimi a euro
            name: products.smartRevolution.product.name,
            description: products.smartRevolution.product.description
          },
          sviluppoPersonale: {
            productId: products.sviluppoPersonale.product.id,
            priceId: products.sviluppoPersonale.price.id,
            amount: (products.sviluppoPersonale.price.unit_amount || 400000) / 100, // Converti da centesimi a euro
            name: products.sviluppoPersonale.product.name,
            description: products.sviluppoPersonale.product.description
          }
        }
      });
    } catch (error: any) {
      console.error("Errore nel recupero dei prodotti Stripe:", error);
      return res.status(500).json({
        success: false,
        message: "Errore nel recupero dei prodotti",
        error: error.message
      });
    }
  });

  // API per creare un pagamento Smart Revolution Sprint
  app.post("/api/checkout/workshop", async (_req, res) => {
    try {
      const products = await getStripeProducts();
      const priceId = products.smartRevolution.price.id;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 3700, // €37.00
        currency: "eur",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          product_id: products.smartRevolution.product.id,
          product_name: "Smart Revolution Sprint"
        },
        description: "Smart Revolution Sprint - Workshop di 60 minuti"
      });
      
      return res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        amount: 37,
        productName: "Smart Revolution Sprint"
      });
    } catch (error: any) {
      console.error("Stripe error:", error);
      return res.status(500).json({ 
        success: false,
        message: "Errore durante la creazione dell'intento di pagamento per il workshop",
        error: error.message 
      });
    }
  });
  
  // API per creare un pagamento Percorso Formativo
  app.post("/api/checkout/course", async (_req, res) => {
    try {
      const products = await getStripeProducts();
      const priceId = products.sviluppoPersonale.price.id;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 399800, // €3998.00
        currency: "eur",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          product_id: products.sviluppoPersonale.product.id,
          product_name: "Percorso Formativo in Sviluppo Personale",
          original_price: "7998"
        },
        description: "Percorso Formativo in Sviluppo Personale - Corso completo"
      });
      
      return res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        amount: 3998,
        productName: "Percorso Formativo in Sviluppo Personale"
      });
    } catch (error: any) {
      console.error("Stripe error:", error);
      return res.status(500).json({ 
        success: false,
        message: "Errore durante la creazione dell'intento di pagamento per il corso",
        error: error.message 
      });
    }
  });
  
  // Stripe payment route for generic one-time payments (maintained for backward compatibility)
  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { amount, productType } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "L'importo deve essere positivo"
        });
      }
      
      let description = "Pagamento generico";
      let metadata = {};
      
      if (productType === 'workshop') {
        description = "Smart Revolution Sprint - Workshop di 60 minuti";
        metadata = {
          product_type: "workshop",
          product_name: "Smart Revolution Sprint"
        };
      } else if (productType === 'course') {
        description = "Percorso Formativo in Sviluppo Personale - Corso completo";
        metadata = {
          product_type: "course",
          product_name: "Percorso Formativo in Sviluppo Personale",
          original_price: "7998"
        };
      }
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "eur",
        automatic_payment_methods: {
          enabled: true,
        },
        description,
        metadata
      });
      
      return res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret
      });
    } catch (error: any) {
      console.error("Stripe error:", error);
      return res.status(500).json({ 
        success: false,
        message: "Errore durante la creazione dell'intento di pagamento",
        error: error.message 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
