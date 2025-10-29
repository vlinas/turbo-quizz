import DB from "../db.server";
import { updateDiscount } from "../discount_server";

function combineDateTime(date, time) {
  console.log('Time Received: ', time);
  const formattedDate = date ? date : "1970-01-01";
  const formattedTime = time ? time : getCurrentTimeEST();

  // const combinedDateTime = `${formattedDate}T${formattedTime}.000Z`;
  const combinedDateTime = `${formattedDate}T${formattedTime}:00-05:00`;

  return combinedDateTime;
}
export async function retrieveFormData(formData) {
  const data = {};

  let startDateTime = null;
  let expireDateTime = null;
  // console.log('Form Entries: ', formData.entries());
  for (const [key, value] of formData.entries()) {
    // console.log("key:"+ key + "value: " + value);
    if(key === 'prerequisite_collection_ids'){
      const idsArray = value.split(',');
      // data[key] = idsArray.map(id => id.trim());
      data[key] = idsArray.map(id => parseInt(id.trim(), 10));
    }
    else if(key === 'entitled_product_ids'){
      const idsArray = value.split(',');
      // data[key] = idsArray.map(id => id.trim());
      data[key] = idsArray.map(id => parseInt(id.trim(), 10));
    }
    else if(key === 'prerequisite_collection'){
      data['prerequisite_collection'] = value;
      data['applied_to'] = value === 'entire_order' ? 'All' : value;
    }
    else if (key === "prerequisite_to_entitlement_quantity_ratio"){
      data[key] = JSON.parse(value);
    }
    else if(key == "quantity" || key == "code_length"){
      data[key] = parseInt(value);
    }
    else if(key == "start_date"){
      // console.log('Time: ', formData.get('start_time'));
      if(value != null && value != ""){
        startDateTime = combineDateTime(value, formData.get('start_time'));
        console.log('DateTime Settings: ', startDateTime);
        if(startDateTime != ""){
          data[key] = (startDateTime);
        }
      }else{
        data[key] = value;
      }
    }else if(key == "start_time"){
      data[key] = value;
    }
    else if(key == "end_date"){
      // console.log('Date Value: ', value);
      if(value != null && value != ""){
        if(formData.get('end_time') != null){
          expireDateTime = combineDateTime(value, formData.get('end_time'));
        }
        // console.log('DateTime Settings: ', startDateTime);
        if(expireDateTime != ""){
          data['expires'] = (expireDateTime);
        }else{
          data['expires'] = null;
        }
        // data[key] = value;
      }
    }else if(key === "end_time"){
      data[key] = value;
    }
    else if(value == ""){
      data[key] = null;
    }
    else{
      data[key] = value;
    }
  }
  return data;
}
export async function AddDiscountCoupon(params) {
  const createdCoupon = await DB.discount_coupons.create({
    data: {
      shop: params.shop,
      coupon_id: params.price_rule_id,
      title: params.title,
      prefix_code: params.prefix_code,
      code_length: params.code_length,
      quantity: params.quantity,
      discount_type: params.discount_type,
      discount_value: params.discount_value,
      target_type: params.target_type || null,
      target_selection: params.target_selection || null,
      customer_selection: params.customer_selection || null,
      allocation_method: params.allocation_method || null,
      applied_to: params.applied_to || null,
      min_requirement_info: params.min_requirement_info || null,
      minimum_req: params.minimum_req || null,
      minimum_quantity_req: params.minimum_quantity_req || null,
      starts_at: params.start_date || null,
      allocation_limit: params.allocation_limit || null,
      prerequisite_collection_ids: JSON.stringify(params.prerequisite_collection_ids) || undefined,
      entitled_product_ids: JSON.stringify(params.entitled_product_ids) || undefined,
      prerequisite_to_entitlement_quantity_ratio: (params.prerequisite_to_entitlement_quantity_ratio) || undefined,
      expires: params.expires || null,
      revenue: params.revenue || 0,
      used: params.used || 0,
      starts_time: params.start_time || null,
      end_date_checked: params.end_date_checked || null,
      expires_time: params.end_time || null,
      button_style_type: params.button_style_type || "sticker",
      standard_btn_bg_color: params.standard_btn_bg_color || null,
      standard_btn_border_color: params.standard_btn_border_color || null,
      standard_btn_text: params.standard_btn_text || null,
      standard_btn_text_color: params.standard_btn_text_color || null,
      success_btn_bg_color: params.success_btn_bg_color || null,
      success_btn_border_color: params.success_btn_border_color || null,
      success_btn_text: params.success_btn_text || null,
      success_btn_text_color: params.success_btn_text_color || null
    }
  });
  let response = {
    success: true,
    params: params,
    data: createdCoupon,
    message: {}
  };
  return response;
}
export async function createCouponBatch(session, admin, params) {
  const discount_code = await new admin.rest.resources.DiscountCode({
    session,
  });
  const discount_codes_generated = [];
  // const codesParams = {};
  let savedCodes = [];
  console.log('params in 128 helper: ', params);
  for (let i = 1; i <= params.quantity; i++) {
    const code = generateCouponCode(params.code_length, params.prefix_code);
    discount_codes_generated.push({ code: code });
     const codesParams = {
      discount_coupon_id: params.price_rule_id,
      shop: params.shop,
      code: code.toString(),
      batch_id: params.batch_id,
      used: 0,
      usable_qty: 1
    };

    savedCodes = await DB.discount_coupons_codes.create({
      data: codesParams,
    });
  }

  discount_code.price_rule_id = params.price_rule_id;

  await discount_code.batch({
    body: {
      discount_codes: discount_codes_generated,
    },
  });

  let response = {
    success: true,
    data: savedCodes,
    message: "Codes Generated Successfully..."
  };
  console.log(response);
  return response;
}

export async function addExtraCouponBatch(session, admin, params) {
  const discount_code = await new admin.rest.resources.DiscountCode({
    session,
  });
  const discount_codes_generated = [];
  // const codesParams = {};
  let savedCodes = [];
  // console.log('params in 52 helper: ', params);
  for (let i = 1; i <= params.newQty; i++) {
    const code = generateCouponCode(params.code_length, params.prefix_code);
    discount_codes_generated.push({ code: code });
     const codesParams = {
      discount_coupon_id: params.price_rule_id.toString(),
      shop: params.shop,
      code: code.toString(),
      batch_id: params.id.toString(),
      used: 0,
      usable_qty: 1
    };

    savedCodes = await DB.discount_coupons_codes.create({
      data: codesParams,
    });

    let updataDiscountParams = {
      quantity: parseInt(params.quantity) + parseInt(params.newQty),
    }
    await updateDiscount(params.price_rule_id, updataDiscountParams)
  }

  discount_code.price_rule_id = params.price_rule_id;

  await discount_code.batch({
    body: {
      discount_codes: discount_codes_generated,
    },
  });

  let response = {
    success: true,
    data: savedCodes,
    message: "Codes Generated Successfully..."
  };
  console.log(response);
  return response;
}
export async function createPriceRule(session, admin, params) {
  let price_rule= {};
  try {
    price_rule = await new admin.rest.resources.PriceRule({ session });
    price_rule.title = params.title; // eg rule title or name

    // The value type of the price rule. Valid values: fixed_amount, percentage
    price_rule.value_type = params.discount_type; //eg percentage

    // The value of the price rule. If if the value of target_type is shipping_line, then only -100 is accepted. The value must be negative.
    price_rule.value = params.discount_value; // discount value for coupon

    // customer selection (
    // all: The price rule is valid for all customers.
    // prerequisite: The customer must either belong to one of the customer segments specified by
    // customer_segment_prerequisite_ids, or be one of the customers specified by prerequisite_customer_ids. )
    price_rule.customer_selection = params.customer_selection ? params.customer_selection : 'all';

    // The target type that the price rule applies to. Valid values:
    // line_item: The price rule applies to the cart's line items.
    // shipping_line: The price rule applies to the cart's shipping lines.
    // price_rule.target_type = params.target_type;
    price_rule.target_type = params.target_type ? params.target_type : 'line_item';

    // The target type that the price rule applies to. Valid values:
    // all: The price rule applies the discount to all line items in the checkout.
    // entitled: The price rule applies the discount to selected entitlements only.
    // price_rule.target_selection = params.target_selection;
    price_rule.target_selection = params.target_selection ? params.target_selection : 'all';

    // The allocation method of the price rule. Valid values:
    // each: The discount is applied to each of the entitled items. For example, for a price rule that takes $15 off, each entitled line item in a checkout will be discounted by $15.
    // across: The calculated discount amount will be applied across the entitled items. For example, for a price rule that takes $15 off, the discount will be applied across all the entitled items.
    // When the value of target_type is shipping_line, then this value must be each.
    // price_rule.allocation_method = params.allocation_method;
    price_rule.allocation_method = params.allocation_method ? params.allocation_method : 'across';

    // format: "2018-03-22T00:00:00-00:00"
    price_rule.starts_at = params.start_date;
    if(params.expires){
      price_rule.ends_at = params.expires;
    }
/*     price_rule.prerequisite_collection_ids = params.prerequisite_collection_ids;
    price_rule.entitled_product_ids = params.entitled_product_ids;
    price_rule.prerequisite_to_entitlement_quantity_ratio = {
      prerequisite_quantity: 2,
      entitled_quantity: 1,
    }; */

    // let collection_ids = [int(item) for item in json.loads(params.prerequisite_collection_ids)];
    if(params.prerequisite_collection_ids) {
      price_rule.entitled_collection_ids = params.prerequisite_collection_ids;

      // price_rule.entitled_product_ids = [
      //   8201788424440
      // ];
    }else{
      // price_rule.prerequisite_collection_ids = [];
    }
    if(params.entitled_product_ids){
      price_rule.entitled_product_ids = params.entitled_product_ids;
    }else{
      // price_rule.entitled_product_ids = [];
    }
    if(params.prerequisite_to_entitlement_quantity_ratio){
      price_rule.prerequisite_to_entitlement_quantity_ratio = {
        prerequisite_quantity: 2,
        entitled_quantity: 1
      };
    }else{
      // price_rule.prerequisite_to_entitlement_quantity_ratio = []
    }

    price_rule.allocation_limit = params.allocation_limit ? params.allocation_limit : null;
    if(params.min_requirement_info == "Minimum Purchase Of"){
      price_rule.prerequisite_subtotal_range = {
        greater_than_or_equal_to: params.minimum_req
      };
    }else if(params.min_requirement_info == "Minimum Quantity Of"){
      price_rule.prerequisite_quantity_range = {
        greater_than_or_equal_to: params.minimum_quantity_req
      };
    }


    // console.log("Price Rule Params: ", price_rule);
    await price_rule.save({
      update: true,
    });

    let response = {
      success: true,
      params: params,
      data: price_rule,
      message: "Price Rule Created Successfully..."
    };
    // console.log("price rule created: ", price_rule);
    return response;
  } catch (error) {
    // console.log("Error in Helper: ", error);
    let response = {
      success: false,
      params: params,
      data: price_rule,
      error: error,
      status: error.status,
      message: error.statusText
    };
    return response;
  }
}

function generateCouponCode(codeLength, prefix) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = prefix;

  for (let i = 0; i < codeLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters.charAt(randomIndex);
  }

  return code;
}

export const formValidation = (formFields) => {
  let result = {
    success: true, // Set the default to true
    data: [],
    message: {},
  };

  let newErrorMessages = {};

  Object.keys(formFields).forEach((fieldName) => {
    if (fieldName != "minimum_quantity_req" && fieldName != "minimum_req" && fieldName != "end_date_checked" && fieldName != "start_time" && fieldName != "end_time" && fieldName != 'allocation_limit' && fieldName != "prerequisite_to_entitlement_quantity_ratio") {
      if(formFields[fieldName] == "" || formFields[fieldName] == null){
        newErrorMessages[fieldName] = fieldName + " is required";
      }

      if (fieldName == "discount_value" && (formFields[fieldName] > 0 || formFields[fieldName] < -100)) {
        newErrorMessages[fieldName] =
          "Discount must ben in Negative value (eg: 0 to -100)";
      }

      if(fieldName === "quantity" && (formFields[fieldName] < 1 || formFields[fieldName] == "" || formFields[fieldName] == null) ) {
        newErrorMessages[fieldName] =
          "Wrong Value (must be > 0)";
      }

    }
    else if(formFields['min_purchase_req'] === "min_quantity_items" && fieldName === "minimum_quantity_req" && (formFields[fieldName] <= 0 || formFields[fieldName] == "") ){
      // if(formFields['min_purchase_req'] === "min_quantity_items")
        newErrorMessages[fieldName] = fieldName + " is required or Wrong Value (must be > 0)";
    }
    else if(formFields['min_purchase_req'] === "min_purchase_amount" && fieldName === "minimum_req" && (formFields[fieldName] <= 0 || formFields[fieldName] == "") ){
      // if(formFields['min_purchase_req'] === "min_quantity_items")
        newErrorMessages[fieldName] = fieldName + " is required or Wrong Value (must be > 0)";
    }

    if (newErrorMessages[fieldName]) {
      result.success = false;
    }



  });
  result.data = formFields;
  result.message = newErrorMessages;
  // console.log('Errors: ', result.message);

  return result;
};


export const getCurrentTimeEST = () => {
  // Function to get the current time in EST
  const options = {
    timeZone: 'America/New_York', // Set the timezone to EST
    hour12: false, // Use 24-hour format
    hour: 'numeric',
    minute: 'numeric',
  };

  const currentDate = new Date();
  return new Intl.DateTimeFormat('en-US', options).format(currentDate);
}

export const getCurrentDateTimeEST = (oldDate = null) => {
  // Function to get the current date and time in EST
  const options = {
    timeZone: 'America/New_York', // Set the timezone to EST
    hour12: false, // Use 24-hour format
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  };
  let currentDate;
  if(oldDate === null)
    currentDate = new Date();
  else{
    currentDate = new Date(oldDate);
  }
  let date = currentDate.setHours(currentDate.getHours() + 5);
  return new Intl.DateTimeFormat('en-US', options).format(date);
}


